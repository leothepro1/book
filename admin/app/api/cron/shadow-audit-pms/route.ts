export const dynamic = "force-dynamic";

/**
 * Cron: Shadow Audit (delivery-guarantee verification)
 * ═══════════════════════════════════════════════════════
 *
 * Once a day, walks every local Booking that claims to exist at the
 * PMS (pmsBookingRef set, recent) and verifies against the PMS
 * directly. Field-by-field comparison of checkIn / checkOut /
 * guests / email / status. Anything that doesn't match gets
 * flagged via Booking.integrityFlag for operator review.
 *
 * Why this exists on top of the reconciliation cron:
 *
 *   - Reconciliation is WRITE-direction (PMS → us): it ensures our
 *     local state catches modifications that happened at PMS.
 *     Shadow audit is READ-direction (verify our state matches PMS).
 *   - Reconciliation only sweeps bookings modified in a recent
 *     window (30 min / 24 h / 7 d). A booking that's been stable
 *     for weeks but was silently corrupted locally would never be
 *     re-checked. Shadow audit sweeps by OUR timestamp (createdAt
 *     30 days), so aging stable bookings ARE verified.
 *   - Reconciliation assumes the PMS is the source of truth.
 *     Shadow audit doesn't auto-correct — it just flags. Decision
 *     to reconcile is left to operator (some mismatches are our
 *     bug, not PMS's).
 *
 * Schedule: nightly 02:30 UTC. Runs before the cleanup cron (04:17)
 * so integrity flags aren't lost to retention deletion.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { log } from "@/app/_lib/logger";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { verifyPmsState } from "@/app/_lib/integrations/reliability/verify-pms-state";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { interleaveByGroup } from "@/app/_lib/concurrency/round-robin";

// How many bookings to audit per run. Each audit is one PMS network
// call (~500ms). 500 rows × 0.5s / 8 concurrent = 31s — fits inside
// the 55s wall budget comfortably.
const BATCH_SIZE = 500;
const POOL_CONCURRENCY = 8;
const ROUTE_WALL_BUDGET_MS = 55_000;
const AUDIT_WINDOW_DAYS = 30;

// Oversample before round-robin-interleave (see retry-pms-webhooks).
const FETCH_MULTIPLIER = 3;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const windowStart = new Date(
    Date.now() - AUDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Select bookings that (a) claim to be at the PMS (pmsBookingRef
  // not null), (b) are in an active lifecycle state (not CANCELLED),
  // (c) created within the audit window, (d) haven't already been
  // flagged as mismatched recently (don't re-flag endlessly).
  const candidates = await prisma.booking.findMany({
    where: {
      pmsBookingRef: { not: null },
      status: { in: ["PRE_CHECKIN", "ACTIVE", "COMPLETED"] },
      createdAt: { gte: windowStart },
      // Skip bookings that were flagged in the last 24h — no point
      // re-flagging for the same mismatch every night; operator
      // needs time to investigate.
      OR: [
        { integrityDetectedAt: null },
        {
          integrityDetectedAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      pmsBookingRef: true,
      checkIn: true,
      checkOut: true,
      guestCount: true,
      guestEmail: true,
    },
    orderBy: [{ integrityDetectedAt: "asc" }, { createdAt: "asc" }],
    take: BATCH_SIZE * FETCH_MULTIPLIER,
  });

  const due = interleaveByGroup(
    candidates,
    (b) => b.tenantId,
    BATCH_SIZE,
  );

  const counters = {
    audited: 0,
    matches: 0,
    mismatches: 0,
    pmsNotFound: 0,
    stateMismatch: 0,
    adapterUnreachable: 0,
    errors: 0,
    skippedBudget: 0,
  };

  const outcomes = await runWithPool(
    due,
    async (b) => {
      if (!b.checkIn || !b.checkOut || !b.pmsBookingRef) {
        // Guard — schema allows null but the WHERE clause should
        // have excluded these. Skip silently rather than throw.
        return { skipped: true };
      }
      const adapter = await resolveAdapter(b.tenantId);
      const result = await verifyPmsState({
        adapter,
        tenantId: b.tenantId,
        externalId: b.pmsBookingRef,
        expected: {
          checkIn: b.checkIn.toISOString().slice(0, 10),
          checkOut: b.checkOut.toISOString().slice(0, 10),
          guests: b.guestCount ?? 1,
          email: b.guestEmail,
        },
      });

      if (result.matches) return { skipped: false, matched: true };

      if (result.reason === "adapter_unreachable") {
        return { skipped: false, matched: false, unreachable: true };
      }

      const flag =
        result.reason === "pms_not_found"
          ? "PMS_NOT_FOUND"
          : result.reason === "state_mismatch"
            ? "STATE_MISMATCH"
            : "MISMATCH";

      await prisma.booking.update({
        where: { id: b.id },
        data: {
          integrityFlag: flag,
          integrityMismatchFields: ((result.mismatches ??
            []) as unknown) as Prisma.InputJsonValue,
          integrityDetectedAt: new Date(),
        },
      });

      log("error", "pms.integrity.shadow_audit_mismatch", {
        tenantId: b.tenantId,
        bookingId: b.id,
        pmsBookingRef: b.pmsBookingRef,
        reason: result.reason,
        mismatchCount: result.mismatches?.length ?? 0,
      });

      return { skipped: false, matched: false, reason: result.reason };
    },
    {
      concurrency: POOL_CONCURRENCY,
      deadline: startedAt + ROUTE_WALL_BUDGET_MS,
    },
  );

  for (const o of outcomes) {
    if (o.skippedDueToBudget) {
      counters.skippedBudget++;
      continue;
    }
    if (!o.ok) {
      counters.errors++;
      continue;
    }
    const val = o.value as {
      skipped?: boolean;
      matched?: boolean;
      unreachable?: boolean;
      reason?: string;
    };
    if (val.skipped) continue;
    counters.audited++;
    if (val.matched) {
      counters.matches++;
    } else if (val.unreachable) {
      counters.adapterUnreachable++;
    } else {
      counters.mismatches++;
      if (val.reason === "pms_not_found") counters.pmsNotFound++;
      else if (val.reason === "state_mismatch") counters.stateMismatch++;
    }
  }

  const durationMs = Date.now() - startedAt;

  log("info", "pms.integrity.shadow_audit_completed", {
    durationMs,
    batchSize: due.length,
    ...counters,
  });

  return Response.json({
    ok: true,
    durationMs,
    batchSize: due.length,
    ...counters,
  });
}
