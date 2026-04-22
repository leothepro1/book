/**
 * PMS Reliability Engine — Outbound Booking Pipeline
 * ═════════════════════════════════════════════════════
 *
 * Counterpart to the webhook inbox: when a guest has paid in our
 * checkout and we must write that reservation to the hotel's PMS,
 * this module is the durable path that guarantees either
 *
 *     (a) the PMS booking is eventually created and the Order is
 *         transitioned to FULFILLED, OR
 *
 *     (b) the guest is refunded, the Order is CANCELLED + REFUNDED,
 *         and the guest is notified — if the PMS rejected the
 *         booking persistently.
 *
 * The single failure mode this module exists to prevent is the one
 * that kills trust in a booking platform: "guest paid, hotel has no
 * record." Without this pipeline, a transient Mews 503 during the
 * post-payment side-effects would leave the order in ON_HOLD awaiting
 * a human. At 100 bookings/day with a 0.5 % PMS fail rate that's
 * 3–4 manual recoveries per week. With this pipeline it's zero — the
 * retry cron drains the outbox automatically, and if the adapter
 * truly can't create the booking we refund in the same pass.
 *
 * Status machine (mirrors the semantics we already use for webhook
 * inbox — same retry ladder, same CAS claim, same dead-letter):
 *
 *     PENDING ──┐
 *               ▼
 *           PROCESSING ──success──► COMPLETED ⟂
 *           │
 *           ├─ retryable fail ────► FAILED ──(ladder not done)──► back to PROCESSING
 *           │                         │
 *           │                         └─ ladder exhausted ──────► DEAD
 *           │
 *           └─ non-retryable fail ──► DEAD
 *
 *     DEAD ──► COMPENSATING ──success──► COMPENSATED ⟂
 *              │
 *              └─ ladder exhausted ──► COMPENSATION_FAILED ⟂ (page operator)
 *
 * Two separate retry ladders — primary (createBooking) and
 * compensation (Stripe refund + Order cancel) — because failure
 * there means a different operator response.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { AdapterFailure } from "./webhook";
import { createPmsBookingAfterPayment } from "@/app/_lib/accommodations/create-pms-booking";

// ── Retry ladders ───────────────────────────────────────────
//
// Same cadence as the webhook inbox for operational consistency.
// If you change one, change both.

const RETRY_DELAYS_MS = [
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
  24 * 60 * 60_000,
];

export const MAX_PRIMARY_ATTEMPTS = RETRY_DELAYS_MS.length;
export const MAX_COMPENSATION_ATTEMPTS = RETRY_DELAYS_MS.length;

// Strandd-reclaim window — matches webhook inbox.
export const OUTBOUND_RECLAIM_AFTER_MS = 5 * 60_000;

function nextDelayMs(attempt: number): number | null {
  if (attempt < 1 || attempt > RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attempt - 1];
}

// ── Public: enqueue a job for a paid order ──────────────────
//
// Called from process-paid-side-effects. Idempotent via the
// @@unique(orderId) constraint — calling twice for the same order is
// safe; the second call collides at the DB and is returned as the
// existing job without a new row.

export interface OutboundEnqueueResult {
  jobId: string;
  created: boolean; // false = already existed (idempotent replay)
}

export async function enqueueOutboundJob(args: {
  orderId: string;
  tenantId: string;
}): Promise<OutboundEnqueueResult> {
  try {
    const job = await prisma.pmsOutboundJob.create({
      data: {
        orderId: args.orderId,
        tenantId: args.tenantId,
        status: "PENDING",
      },
      select: { id: true },
    });
    log("info", "pms.outbound.enqueued", {
      tenantId: args.tenantId,
      orderId: args.orderId,
      jobId: job.id,
    });
    return { jobId: job.id, created: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Existing job — idempotent path. Return its id.
      const existing = await prisma.pmsOutboundJob.findUnique({
        where: { orderId: args.orderId },
        select: { id: true },
      });
      if (existing) return { jobId: existing.id, created: false };
    }
    throw err;
  }
}

// ── Internal: status classification ─────────────────────────

type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "DEAD"
  | "COMPENSATING"
  | "COMPENSATED"
  | "COMPENSATION_FAILED";

// ── Primary phase: processOutboundJob ───────────────────────
//
// Claim → try createPmsBookingAfterPayment → terminal CAS.
// Adapter-classified failures trip the circuit breaker indirectly
// (they propagate as AdapterFailure if the adapter layer threw).

export async function processOutboundJob(jobId: string): Promise<JobStatus> {
  const row = await prisma.pmsOutboundJob.findUnique({
    where: { id: jobId },
  });
  if (!row) return "DEAD";
  if (
    row.status === "COMPLETED" ||
    row.status === "COMPENSATED" ||
    row.status === "COMPENSATION_FAILED"
  ) {
    return row.status as JobStatus;
  }
  // DEAD rows are handled by compensateOutboundJob, not here.
  if (row.status === "DEAD" || row.status === "COMPENSATING") {
    return row.status as JobStatus;
  }

  setSentryTenantContext(row.tenantId);

  const claimedAt = new Date();
  const reclaimCutoff = new Date(
    claimedAt.getTime() - OUTBOUND_RECLAIM_AFTER_MS,
  );

  const claim = await prisma.pmsOutboundJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        {
          status: "PROCESSING",
          lastAttemptAt: { lt: reclaimCutoff },
        },
      ],
    },
    data: {
      status: "PROCESSING",
      lastAttemptAt: claimedAt,
      attempts: { increment: 1 },
    },
  });
  if (claim.count === 0) return row.status as JobStatus;

  const attempts = row.attempts + 1;
  const startedAt = Date.now();
  const rowTenantId = row.tenantId; // capture for closure
  const rowOrderId = row.orderId;

  async function casUpdate(
    data: Prisma.PmsOutboundJobUpdateManyMutationInput,
  ): Promise<boolean> {
    const res = await prisma.pmsOutboundJob.updateMany({
      where: { id: jobId, status: "PROCESSING", lastAttemptAt: claimedAt },
      data,
    });
    if (res.count === 0) {
      log("warn", "pms.outbound.cas_lost", {
        jobId,
        tenantId: rowTenantId,
      });
    }
    return res.count > 0;
  }

  try {
    const result = await createPmsBookingAfterPayment({
      orderId: rowOrderId,
      tenantId: rowTenantId,
    });

    if (result.ok) {
      const casOk = await casUpdate({
        status: "COMPLETED",
        completedAt: new Date(),
        lastError: null,
        nextRetryAt: null,
      });
      if (!casOk) return "COMPLETED"; // reclaimer owns the row

      log("info", "pms.outbound.completed", {
        tenantId: row.tenantId,
        orderId: row.orderId,
        jobId,
        pmsBookingRef: result.pmsBookingRef,
        attempts,
        durationMs: Date.now() - startedAt,
      });
      return "COMPLETED";
    }

    // result.ok === false — treat as thrown error so retry ladder
    // applies uniformly. Non-retryable failures jump straight to DEAD
    // by setting attempts to the ladder's end.
    const syntheticErr = new Error(result.error);
    if (!result.retryable) {
      // Force DEAD immediately — non-retryable means retry won't help.
      throw Object.assign(syntheticErr, { __forceDeadLetter: true });
    }
    throw syntheticErr;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const forceDead =
      err !== null &&
      typeof err === "object" &&
      (err as { __forceDeadLetter?: boolean }).__forceDeadLetter === true;
    const adapterFailure = err instanceof AdapterFailure;

    const delayMs = forceDead ? null : nextDelayMs(attempts);

    if (delayMs === null) {
      // Retry ladder exhausted OR forced DEAD. Move to DEAD so the
      // compensation cron picks this up and issues the refund.
      const casOk = await casUpdate({
        status: "DEAD",
        lastError: msg.slice(0, 1000),
        nextRetryAt: null,
        deadAt: new Date(),
        // Schedule compensation to run immediately via the next cron.
        compensationNextRetryAt: new Date(),
      });
      if (!casOk) return "DEAD";

      log("error", "pms.outbound.dead", {
        tenantId: row.tenantId,
        orderId: row.orderId,
        jobId,
        attempts,
        error: msg,
        adapterFailure,
        forceDead,
      });
      return "DEAD";
    }

    const casOk = await casUpdate({
      status: "FAILED",
      lastError: msg.slice(0, 1000),
      nextRetryAt: new Date(Date.now() + delayMs),
    });
    if (!casOk) return "FAILED";

    log("warn", "pms.outbound.retry_scheduled", {
      tenantId: row.tenantId,
      orderId: row.orderId,
      jobId,
      attempts,
      retryInMs: delayMs,
      error: msg,
      adapterFailure,
    });
    return "FAILED";
  }
}

// ── Compensation phase ──────────────────────────────────────
//
// A DEAD job means: guest paid but the PMS didn't accept. We refund
// the payment, cancel the Order, and notify the guest. Same CAS
// claim + retry ladder semantics as the primary phase, scoped to
// DEAD/COMPENSATING rows.

export async function compensateOutboundJob(jobId: string): Promise<JobStatus> {
  const row = await prisma.pmsOutboundJob.findUnique({
    where: { id: jobId },
  });
  if (!row) return "COMPENSATION_FAILED";
  if (
    row.status === "COMPLETED" ||
    row.status === "COMPENSATED" ||
    row.status === "COMPENSATION_FAILED"
  ) {
    return row.status as JobStatus;
  }
  // PENDING/PROCESSING/FAILED still belong to the primary phase.
  if (
    row.status === "PENDING" ||
    row.status === "PROCESSING" ||
    row.status === "FAILED"
  ) {
    return row.status as JobStatus;
  }

  setSentryTenantContext(row.tenantId);

  const claimedAt = new Date();
  const reclaimCutoff = new Date(
    claimedAt.getTime() - OUTBOUND_RECLAIM_AFTER_MS,
  );

  const claim = await prisma.pmsOutboundJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: "DEAD" },
        {
          status: "COMPENSATING",
          compensationLastAt: { lt: reclaimCutoff },
        },
      ],
    },
    data: {
      status: "COMPENSATING",
      compensationLastAt: claimedAt,
      compensationAttempts: { increment: 1 },
    },
  });
  if (claim.count === 0) return row.status as JobStatus;

  const attempts = row.compensationAttempts + 1;

  async function casUpdate(
    data: Prisma.PmsOutboundJobUpdateManyMutationInput,
  ): Promise<boolean> {
    const res = await prisma.pmsOutboundJob.updateMany({
      where: {
        id: jobId,
        status: "COMPENSATING",
        compensationLastAt: claimedAt,
      },
      data,
    });
    if (res.count === 0) {
      log("warn", "pms.outbound.compensation.cas_lost", { jobId });
    }
    return res.count > 0;
  }

  try {
    await runCompensation(row.tenantId, row.orderId);

    const casOk = await casUpdate({
      status: "COMPENSATED",
      compensationLastError: null,
      compensationNextRetryAt: null,
    });
    if (!casOk) return "COMPENSATED";

    log("info", "pms.outbound.compensated", {
      tenantId: row.tenantId,
      orderId: row.orderId,
      jobId,
      compensationAttempts: attempts,
    });
    return "COMPENSATED";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const delayMs = nextDelayMs(attempts);

    if (delayMs === null) {
      const casOk = await casUpdate({
        status: "COMPENSATION_FAILED",
        compensationLastError: msg.slice(0, 1000),
        compensationNextRetryAt: null,
      });
      if (!casOk) return "COMPENSATION_FAILED";

      // This is the worst case — guest paid, PMS rejected, AND refund
      // failed. Must alert operators; money remains with Stripe
      // until manual resolution.
      log("error", "pms.outbound.compensation_failed_terminal", {
        tenantId: row.tenantId,
        orderId: row.orderId,
        jobId,
        compensationAttempts: attempts,
        error: msg,
      });

      // Fire an operator alert email. Fire-and-forget (.catch
      // swallowed inside sendOperatorAlert) so email-send issues
      // don't rattle back into this state machine. The DEAD row
      // already exists in the DB as a backup signal.
      const { sendOperatorAlert } = await import("./alert-operator");
      void sendOperatorAlert({
        subject: `Compensation FAILED for order ${row.orderId}`,
        severity: "urgent",
        tenantId: row.tenantId,
        body: [
          "An outbound PMS booking could not be created AND the compensating Stripe refund also failed after the full retry ladder.",
          "",
          `Tenant:     ${row.tenantId}`,
          `Order:      ${row.orderId}`,
          `Job:        ${jobId}`,
          `Attempts:   ${attempts} compensation attempts exhausted`,
          `Last error: ${msg}`,
          "",
          "STATE: COMPENSATION_FAILED — money is held at Stripe until a human takes action.",
          "",
          "Manual recovery:",
          "  1. Inspect Stripe charge for this order and decide whether to refund manually",
          "  2. Inspect the PMS — did the booking actually get created in parallel?",
          "  3. Update the order state once resolved (cancel + refund OR mark fulfilled)",
          "  4. Set PmsOutboundJob.status='COMPENSATED' manually after resolution",
        ].join("\n"),
      });

      return "COMPENSATION_FAILED";
    }

    const casOk = await casUpdate({
      status: "DEAD", // back to DEAD so the cron re-picks it
      compensationLastError: msg.slice(0, 1000),
      compensationNextRetryAt: new Date(Date.now() + delayMs),
    });
    if (!casOk) return "DEAD";

    log("warn", "pms.outbound.compensation_retry_scheduled", {
      tenantId: row.tenantId,
      orderId: row.orderId,
      jobId,
      compensationAttempts: attempts,
      retryInMs: delayMs,
      error: msg,
    });
    return "DEAD";
  }
}

// ── Internal: actual compensation side-effects ──────────────
//
// Three steps, each idempotent:
//   1. Stripe refund (guarded by Order.financialStatus — if already
//      REFUNDED we skip)
//   2. Order → CANCELLED + REFUNDED + fulfillmentStatus=CANCELLED
//   3. Booking → CANCELLED (so our local state matches the refund)
//
// We load the refund module lazily so compiling this file doesn't
// pull in the Stripe SDK for every consumer.

async function runCompensation(
  tenantId: string,
  orderId: string,
): Promise<void> {
  const { refundOrderForFailedFulfillment } = await import("./outbound-compensation");
  await refundOrderForFailedFulfillment({ tenantId, orderId });
}
