/**
 * PMS Reliability Engine — Webhook Intake
 * ════════════════════════════════════════
 *
 * Transactional inbox for PMS webhook deliveries. Every event that
 * crosses our edge is first persisted to PmsWebhookInbox — only then
 * do we try to process it. If processing fails or the request budget
 * runs out, the row remains with a nextRetryAt in the future; the
 * retry cron drains it later. A redelivery of the same event from
 * the PMS lands on the unique constraint (provider, externalEventId)
 * and is deflected without work.
 *
 * Why "persist first, process second"?
 *
 *   • Webhooks are the only real-time signal we get. Losing one = a
 *     guest stays at the hotel while our system thinks they haven't
 *     arrived. The inbox guarantees every delivery is captured even
 *     if our downstream processing crashes.
 *   • It decouples the HTTP ack from the business outcome. We can
 *     return 200 to the PMS within a few hundred milliseconds while
 *     deferring the (slower) re-fetch-and-upsert to a worker.
 *   • Retries become cheap and bounded. Exponential backoff ladder
 *     terminates at DEAD after 5 attempts — no infinite loops.
 *
 * Processing strategy:
 *
 *   Every inbox row refers to a booking externalId (when available).
 *   We NEVER trust the webhook's payload as the source of truth.
 *   Instead we call adapter.lookupBooking(externalId) to fetch the
 *   CURRENT state from the PMS, then feed it through the ingest
 *   chokepoint. This is resilient to out-of-order deliveries,
 *   reordered retries, stale payloads, and PMS bugs — whatever
 *   happened at the PMS, we get the latest view.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { resolveAdapter } from "../resolve";
import { logSyncEvent } from "../sync/log";
import { recordFailure, recordSuccess } from "../sync/circuit-breaker";
import type { PmsProvider, PmsWebhookEvent, BookingLookup } from "../types";
import { upsertBookingFromPms } from "./ingest";
import type { BookingUpsertInput, IngestStatus } from "./types";

// ── Retry ladder ────────────────────────────────────────────
//
// Matches the email retry ladder (CLAUDE.md Email retry queue):
// consistent incident-response expectations across the platform.

const RETRY_DELAYS_MS = [
  5 * 60_000, //  1st failure  →  5 min
  15 * 60_000, // 2nd failure  → 15 min
  60 * 60_000, // 3rd failure  →  1 hour
  4 * 60 * 60_000, // 4th failure → 4 hours
  24 * 60 * 60_000, // 5th failure → 24 hours
];

export const MAX_WEBHOOK_ATTEMPTS = RETRY_DELAYS_MS.length;

// ── PROCESSING reclamation window ──────────────────────────
//
// A row in PROCESSING with lastAttemptAt older than this threshold
// is considered stranded — the original worker crashed between claim
// and terminal status update. The retry cron is allowed to reclaim
// such rows. 5 minutes is generous: webhook sync budget is 8s,
// adapter HTTP timeouts are 10–15s, and even with retry backoff a
// healthy processInboxRow finishes well under 60s. Anything older is
// almost certainly a crashed serverless instance.
export const PROCESSING_RECLAIM_AFTER_MS = 5 * 60_000;

// ── Error classification ────────────────────────────────────
//
// The webhook path distinguishes two failure categories for the
// circuit breaker's sake:
//
//   AdapterFailure  — the PMS/adapter itself failed (HTTP 5xx, auth,
//                     timeout, etc.). This is the signal the circuit
//                     breaker was designed for: a burst of these means
//                     the adapter is unhealthy and reconcile should
//                     pause to avoid a retry storm.
//
//   Data failure   — the PMS returned valid HTTP but the booking's
//                     content failed our validation (missing email,
//                     malformed dates, etc.). The adapter is healthy;
//                     only the specific row is bad. Circuit MUST NOT
//                     trip on these or one tenant's data quality
//                     issues lock their entire reliability path.
//
// Only `refetchAndUpsert`'s adapter call throws AdapterFailure;
// everything else (Zod, DB) throws plain Error and lands in the
// FAILED/DEAD path but does NOT update the circuit breaker.
export class AdapterFailure extends Error {
  readonly isAdapterFailure = true as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AdapterFailure";
  }
}

function isAdapterFailure(err: unknown): err is AdapterFailure {
  return (
    err instanceof Error &&
    (err as AdapterFailure).isAdapterFailure === true
  );
}

export function nextRetryDelayMs(attemptNumber: number): number | null {
  // attemptNumber is 1-indexed AFTER the failing attempt, so a first
  // failure (attempts=1) uses RETRY_DELAYS_MS[0].
  if (attemptNumber < 1 || attemptNumber > RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attemptNumber - 1];
}

// ── Outcomes ────────────────────────────────────────────────

export interface WebhookIntakeResult {
  /** How many PmsWebhookEvent objects the adapter parsed. */
  eventsReceived: number;
  /** Rejected by the (provider, externalEventId) unique constraint. */
  eventsDuplicated: number;
  /** Newly inserted inbox rows. */
  eventsInboxed: number;
  /** Processed synchronously and marked PROCESSED. */
  eventsProcessed: number;
  /** Inserted but not processed (budget exceeded or sync failure). */
  eventsDeferred: number;
}

// ── Internal: status ladder ─────────────────────────────────

type InboxStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "DEAD";

function isInboxRetryable(status: InboxStatus): boolean {
  return status === "PENDING" || status === "FAILED";
}

// ── Internal: insert new inbox row (idempotent) ─────────────
//
// Returns the created row, or null if dedup bounced us.

async function insertInboxRow(args: {
  tenantId: string;
  provider: PmsProvider;
  event: PmsWebhookEvent;
  rawPayload: unknown;
}): Promise<{ id: string } | null> {
  try {
    const row = await prisma.pmsWebhookInbox.create({
      data: {
        tenantId: args.tenantId,
        provider: args.provider,
        externalEventId: args.event.externalEventId,
        externalBookingId: args.event.externalBookingId,
        eventType: args.event.eventType,
        rawPayload: args.rawPayload as Prisma.InputJsonValue,
        status: "PENDING",
      },
      select: { id: true },
    });
    return row;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return null; // duplicate delivery — deflected
    }
    throw err;
  }
}

// ── Internal: fetch-and-upsert one inbox row ────────────────
//
// Calls adapter.lookupBooking(externalId) to get the CURRENT PMS
// state, maps to BookingUpsertInput, routes through the ingest
// chokepoint. Returns:
//   "processed"       — ingest action taken (created/updated/...)
//   "no_booking"      — event has no externalBookingId; nothing to do
//   "pms_not_found"   — PMS returned null; likely deleted; no action
//   throws on transient failures (network, DB) — caller retries

async function refetchAndUpsert(args: {
  tenantId: string;
  provider: PmsProvider;
  externalBookingId: string | null;
}): Promise<"processed" | "no_booking" | "pms_not_found"> {
  if (!args.externalBookingId) return "no_booking";

  // Adapter-side failures (HTTP errors, auth, timeouts, Zod of raw
  // PMS responses) surface as AdapterFailure so the caller can
  // correctly route them to the circuit breaker. Zod failures on OUR
  // BookingUpsertInput (data-quality issues) happen inside
  // upsertBookingFromPms below and propagate as plain errors — they
  // are NOT adapter failures and MUST NOT trip the circuit.
  const adapter = await resolveAdapter(args.tenantId);
  let lookup: BookingLookup | null;
  try {
    lookup = await adapter.lookupBooking(args.tenantId, args.externalBookingId);
  } catch (err) {
    throw new AdapterFailure(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }

  if (!lookup) {
    // The PMS no longer recognises this booking. Two common causes:
    //   a) it was deleted (rare but real — some PMSes hard-delete)
    //   b) the adapter's lookupBooking isn't implemented yet
    //
    // For (a) we want to mark our local row CANCELLED, but doing so
    // via a webhook could let a misbehaving PMS nuke bookings by
    // returning null transiently. Reconciliation's cleanup step
    // handles this case with proper guards (multi-window absence,
    // double-check via listBookings). For (b), the reliability cron
    // remains the safety net.
    return "pms_not_found";
  }

  // Map to the ingest contract. Single-token names (Indonesian,
  // Burmese, Icelandic patronymic-only, plus the common case where
  // the PMS has only one name field populated) are a real edge
  // case — the full name goes in firstName, lastName is empty.
  // The ingest contract tolerates this; see IngestGuestSchema.
  const nameTokens = lookup.guestName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameTokens[0] ?? "";
  const lastName = nameTokens.length > 1 ? nameTokens.slice(1).join(" ") : "";

  // BookingLookup carries providerUpdatedAt from the PMS — the
  // authoritative version vector. The ingest chokepoint uses it to
  // reject stale events, so a webhook delivering a state we've
  // already seen via listBookings is correctly identified as stale
  // and dropped without re-triggering email/side-effects.
  const input: BookingUpsertInput = {
    tenantId: args.tenantId,
    provider: args.provider,
    externalId: lookup.externalId,
    providerUpdatedAt: lookup.providerUpdatedAt,
    providerCreatedAt: lookup.createdAt,
    source: "webhook",
    guest: {
      firstName,
      lastName, // "" is valid; see IngestGuestSchema.
      email: lookup.guestEmail,
      phone: lookup.guestPhone,
    },
    stay: {
      checkIn: lookup.checkIn,
      checkOut: lookup.checkOut,
      unit: lookup.categoryName || lookup.externalId,
      guestCount: lookup.guests,
    },
    status: lookup.status as IngestStatus,
  };

  await upsertBookingFromPms(input);
  return "processed";
}

// ── Internal: run one inbox row, update status ──────────────

export async function processInboxRow(rowId: string): Promise<InboxStatus> {
  const row = await prisma.pmsWebhookInbox.findUnique({
    where: { id: rowId },
  });
  if (!row) return "DEAD";
  if (row.status === "PROCESSED" || row.status === "DEAD") return row.status as InboxStatus;

  setSentryTenantContext(row.tenantId);

  // Claim strategy:
  //   • Normal path: PENDING or FAILED → PROCESSING
  //   • Reclaim path: PROCESSING where the previous worker's
  //     lastAttemptAt is older than PROCESSING_RECLAIM_AFTER_MS.
  //     This is the stranded-row recovery: if a serverless instance
  //     crashed between claim and terminal update, no one ever
  //     moves the row out of PROCESSING without this path.
  //
  // The claim stamps `lastAttemptAt` with a value captured here; all
  // of this worker's subsequent writes are guarded by a CAS against
  // that stamp so a second reclaimer that steals mid-flight cannot
  // cause this worker's final update to overwrite the newer state.

  const claimedAt = new Date();
  const reclaimCutoff = new Date(
    claimedAt.getTime() - PROCESSING_RECLAIM_AFTER_MS,
  );

  const claim = await prisma.pmsWebhookInbox.updateMany({
    where: {
      id: rowId,
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
  if (claim.count === 0) return row.status as InboxStatus;

  const wasReclaim = row.status === "PROCESSING";
  if (wasReclaim) {
    log("warn", "pms.webhook.stranded_row_reclaimed", {
      tenantId: row.tenantId,
      provider: row.provider,
      inboxId: rowId,
      previousAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      previousAttempts: row.attempts,
    });
  }

  const attempts = row.attempts + 1; // after the increment
  const startedAt = Date.now();

  // Guard: all terminal status writes use updateMany with a CAS
  // against (id, status=PROCESSING, lastAttemptAt=claimedAt). If a
  // reclaimer stole this row in the meantime, our write returns
  // count=0 and we log without overwriting newer state.
  const rowTenantId = row.tenantId; // narrow for closure capture
  async function casUpdate(
    data: Prisma.PmsWebhookInboxUpdateManyMutationInput,
  ): Promise<boolean> {
    const res = await prisma.pmsWebhookInbox.updateMany({
      where: {
        id: rowId,
        status: "PROCESSING",
        lastAttemptAt: claimedAt,
      },
      data,
    });
    if (res.count === 0) {
      log("warn", "pms.webhook.cas_lost", {
        tenantId: rowTenantId,
        inboxId: rowId,
        intendedStatus: typeof data.status === "string" ? data.status : null,
      });
    }
    return res.count > 0;
  }

  try {
    const outcome = await refetchAndUpsert({
      tenantId: row.tenantId,
      provider: row.provider as PmsProvider,
      externalBookingId: row.externalBookingId,
    });

    const processedAt = new Date();
    const casOk = await casUpdate({
      status: "PROCESSED",
      processedAt,
      lastError: null,
      nextRetryAt: null,
    });
    if (!casOk) {
      // Another worker has moved this row. Don't touch anything
      // else — no recordSuccess, no log event — they'll be emitted
      // by the actual owner.
      return "PROCESSED";
    }

    // Feed the circuit breaker — a successful webhook processing
    // confirms the adapter is healthy for this tenant, so reset
    // consecutiveFailures. Kept best-effort (.catch) so an audit-DB
    // hiccup never undoes a durable Booking write.
    await recordSuccess(row.tenantId, row.provider as PmsProvider).catch(
      () => {},
    );

    // Ingest lag = time from webhook delivery to durable Booking +
    // PROCESSED inbox state. Growth indicates our processing is
    // falling behind PMS push rate (usually retry cron starved).
    const ingestLagMs = processedAt.getTime() - row.receivedAt.getTime();

    log("info", "pms.webhook.processed", {
      tenantId: row.tenantId,
      provider: row.provider,
      inboxId: rowId,
      externalBookingId: row.externalBookingId,
      outcome,
      attempts,
      durationMs: Date.now() - startedAt,
      ingestLagMs,
    });

    await logSyncEvent(
      row.tenantId,
      row.provider,
      "sync.completed",
      {
        source: "webhook",
        inboxId: rowId,
        outcome,
        attempts,
      },
      row.externalBookingId ?? undefined,
    );

    return "PROCESSED";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const adapterFailure = isAdapterFailure(err);
    const delayMs = nextRetryDelayMs(attempts);

    if (delayMs === null) {
      // Exhausted the retry ladder — park as DEAD for manual review.
      const casOk = await casUpdate({
        status: "DEAD",
        lastError: msg.slice(0, 1000),
        nextRetryAt: null,
        deadAt: new Date(),
      });
      if (!casOk) return "DEAD"; // reclaimer owns it now

      // A DEAD row counts toward the circuit breaker ONLY when it's
      // an adapter-level failure — exactly the signal the circuit
      // was designed for. Data-validation failures (Zod, DB) do NOT
      // trip the circuit: they're per-row quality issues, not
      // systemic adapter problems, and letting them open the circuit
      // would wrongly disable reconciliation for a whole tenant.
      if (adapterFailure) {
        await recordFailure(
          row.tenantId,
          row.provider as PmsProvider,
          msg.slice(0, 500),
        ).catch(() => {});
      }

      log("error", "pms.webhook.dead", {
        tenantId: row.tenantId,
        provider: row.provider,
        inboxId: rowId,
        externalBookingId: row.externalBookingId,
        attempts,
        error: msg,
        adapterFailure,
      });

      await logSyncEvent(
        row.tenantId,
        row.provider,
        "sync.failed",
        {
          source: "webhook",
          inboxId: rowId,
          attempts,
          terminal: true,
        },
        row.externalBookingId ?? undefined,
        msg.slice(0, 1000),
      );

      return "DEAD";
    }

    const casOk = await casUpdate({
      status: "FAILED",
      lastError: msg.slice(0, 1000),
      nextRetryAt: new Date(Date.now() + delayMs),
    });
    if (!casOk) return "FAILED"; // reclaimer owns it now

    // FAILED (non-terminal) counts toward the circuit breaker only
    // for adapter-level failures. Repeated adapter failures for the
    // same tenant open the circuit at 5 attempts, which then blocks
    // reconcile from calling the adapter until it recovers. Data-
    // validation failures (e.g. PMS reservations without an email)
    // would falsely trip the circuit and lock out reconciliation,
    // so they are explicitly excluded.
    if (adapterFailure) {
      await recordFailure(
        row.tenantId,
        row.provider as PmsProvider,
        msg.slice(0, 500),
      ).catch(() => {});
    }

    log("warn", "pms.webhook.retry_scheduled", {
      tenantId: row.tenantId,
      provider: row.provider,
      inboxId: rowId,
      externalBookingId: row.externalBookingId,
      attempts,
      retryInMs: delayMs,
      error: msg,
      adapterFailure,
    });

    return "FAILED";
  }
}

// ── Public: webhook intake entry point ──────────────────────

export interface WebhookIntakeInput {
  tenantId: string;
  provider: PmsProvider;
  events: PmsWebhookEvent[];
  rawPayload: unknown;
  /** Wall-clock budget for synchronous processing. Must be a bit
   * below the route's HTTP timeout so we leave headroom to return
   * 200 cleanly even when we yield on budget. */
  processingBudgetMs: number;
}

export async function processPmsWebhook(
  input: WebhookIntakeInput,
): Promise<WebhookIntakeResult> {
  setSentryTenantContext(input.tenantId);

  const result: WebhookIntakeResult = {
    eventsReceived: input.events.length,
    eventsDuplicated: 0,
    eventsInboxed: 0,
    eventsProcessed: 0,
    eventsDeferred: 0,
  };

  const startedAt = Date.now();

  for (const event of input.events) {
    // ── Step 1: persist the event (dedup at unique constraint) ──
    let inserted: { id: string } | null;
    try {
      inserted = await insertInboxRow({
        tenantId: input.tenantId,
        provider: input.provider,
        event,
        rawPayload: input.rawPayload,
      });
    } catch (err) {
      // DB unavailable: we can't persist — let the caller bubble a
      // 5xx so the PMS retries. Better to be loud than silently drop.
      log("error", "pms.webhook.inbox_insert_failed", {
        tenantId: input.tenantId,
        provider: input.provider,
        externalEventId: event.externalEventId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (inserted === null) {
      result.eventsDuplicated++;
      continue;
    }

    result.eventsInboxed++;

    // ── Step 2: try to process synchronously, if budget allows ──
    if (Date.now() - startedAt > input.processingBudgetMs) {
      // Over budget — leave for the retry cron. Set nextRetryAt
      // to "now" so the very next cron run picks it up.
      await prisma.pmsWebhookInbox
        .update({
          where: { id: inserted.id },
          data: { nextRetryAt: new Date() },
        })
        .catch(() => {}); // PENDING+nextRetryAt=null still gets picked
      result.eventsDeferred++;
      continue;
    }

    const outcome = await processInboxRow(inserted.id);
    if (outcome === "PROCESSED") {
      result.eventsProcessed++;
    } else {
      result.eventsDeferred++;
    }
  }

  return result;
}
