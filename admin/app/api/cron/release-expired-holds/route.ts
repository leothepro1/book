export const dynamic = "force-dynamic";

/**
 * Cron: Release Expired Availability Holds
 * ══════════════════════════════════════════
 *
 * Safety net for the checkout-phase availability hold. The PMS side
 * auto-releases Optional reservations at ReleasedUtc, but we still
 * sweep locally because:
 *
 *   1. Our local Booking row must mirror the PMS release — otherwise
 *      the order can stay PENDING indefinitely, tying up business
 *      logic (inventory counters, search-availability, analytics).
 *
 *   2. If the guest comes back mid-abandonment and tries to pay
 *      after the hold expired, we need the Order to already be
 *      CANCELLED so processOrderPaidSideEffects short-circuits and
 *      triggers refund instead of a phantom booking.
 *
 *   3. Mews may not honor ReleasedUtc in every edge case (API
 *     version mismatches, rate-limit retries). Our explicit
 *     releaseHold() call is the deterministic fallback.
 *
 * For each expired-and-still-held booking:
 *   • Call adapter.releaseHold
 *   • Transition Booking → CANCELLED
 *   • Transition Order → CANCELLED (if still PENDING)
 *   • Cancel the Stripe Payment Intent if still cancelable, so the
 *     guest cannot complete a payment whose unit is gone.
 *
 * Schedule: every 5 minutes.
 * Auth: Bearer CRON_SECRET.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { canTransition, canTransitionFinancial } from "@/app/_lib/orders/types";

const BATCH_SIZE = 200;
const POOL_CONCURRENCY = 8;
const ROUTE_WALL_BUDGET_MS = 55_000;

// Grace window: reclaim holds that expired even a few seconds ago.
// Using a small positive offset (not exactly now()) avoids racing
// with the PMS-side auto-release at the exact TTL boundary.
const EXPIRY_GRACE_MS = 30_000;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const cutoff = new Date(Date.now() - EXPIRY_GRACE_MS);

  const due = await prisma.booking.findMany({
    where: {
      holdExpiresAt: { not: null, lt: cutoff },
      holdExternalId: { not: null },
      // Only release holds that haven't been confirmed/cancelled yet.
      // A PRE_CHECKIN booking still in hold state needs release; an
      // ACTIVE/COMPLETED/CANCELLED booking already left the hold
      // phase and should not be touched.
      status: "PRE_CHECKIN",
      pmsBookingRef: null,
      order: {
        status: "PENDING",
      },
    },
    select: {
      id: true,
      tenantId: true,
      orderId: true,
      holdExternalId: true,
      order: {
        select: {
          id: true,
          status: true,
          financialStatus: true,
          paymentSession: {
            select: { externalSessionId: true },
          },
        },
      },
    },
    orderBy: [{ holdExpiresAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
  });

  const counters = {
    released: 0,
    releaseErrors: 0,
    cancelledOrders: 0,
    skippedBudget: 0,
  };

  const outcomes = await runWithPool(
    due,
    async (b) => {
      const externalId = b.holdExternalId!;
      const adapter = await resolveAdapter(b.tenantId);

      // Step 1: tell the PMS to release the hold. Idempotent per
      // adapter contract; if already released this is a no-op.
      await adapter.releaseHold(b.tenantId, externalId);

      // Step 2: mark our local Booking as cancelled.
      await prisma.booking.update({
        where: { id: b.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      // Step 3: cancel the Order if it's still PENDING. A guest who
      // hadn't paid gets the Order voided; a guest who HAD paid
      // would not hit this cron (pmsBookingRef would be set or the
      // order wouldn't be PENDING any more).
      if (b.order && canTransition(b.order.status, "CANCELLED")) {
        const updates: Record<string, unknown> = {
          status: "CANCELLED",
          cancelledAt: new Date(),
        };
        if (canTransitionFinancial(b.order.financialStatus, "VOIDED")) {
          updates.financialStatus = "VOIDED";
        }
        await prisma.order.update({
          where: { id: b.order.id },
          data: updates,
        });
        counters.cancelledOrders++;
      }

      // Step 4 (best effort): cancel the Stripe Payment Intent so
      // the guest cannot complete a payment for a unit they no
      // longer hold. Only attempt if we have a session id; failures
      // here are tolerable (Stripe itself won't accept a charge
      // against a CANCELLED order because processOrderPaidSideEffects
      // will short-circuit the side effects).
      if (b.order?.paymentSession?.externalSessionId) {
        try {
          const { getStripe } = await import("@/app/_lib/stripe/client");
          const stripe = getStripe();
          await stripe.paymentIntents.cancel(
            b.order.paymentSession.externalSessionId,
          );
        } catch (err) {
          // Common: PI was already confirmed/captured/cancelled —
          // Stripe errors with invalid_state. We treat all such
          // errors as non-fatal; we've already cancelled the Order
          // locally so any real payment would hit the outbound
          // compensation pathway.
          log("info", "pms.hold.expire.stripe_cancel_skipped", {
            tenantId: b.tenantId,
            orderId: b.order.id,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      log("info", "pms.hold.released_by_cron", {
        tenantId: b.tenantId,
        orderId: b.orderId,
        bookingId: b.id,
        externalId,
      });
    },
    {
      concurrency: POOL_CONCURRENCY,
      deadline: startedAt + ROUTE_WALL_BUDGET_MS,
    },
  );

  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    const b = due[i];
    if (o.skippedDueToBudget) {
      counters.skippedBudget++;
      continue;
    }
    if (!o.ok) {
      counters.releaseErrors++;
      log("error", "pms.hold.release_failed", {
        tenantId: b.tenantId,
        orderId: b.orderId,
        bookingId: b.id,
        externalId: b.holdExternalId,
        error: o.error?.message ?? "unknown",
      });
      continue;
    }
    counters.released++;
  }

  const durationMs = Date.now() - startedAt;
  log("info", "pms.hold.expire_cron.completed", {
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
