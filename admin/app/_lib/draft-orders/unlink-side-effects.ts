/**
 * `runUnlinkSideEffects` — Phase D, post-commit half of the v1.2 §6.2
 * unlink protocol.
 *
 * Companion to `unlinkActiveCheckoutSession` (the in-tx half). After
 * the caller's transaction commits, this helper performs best-effort
 * external cleanup:
 *
 *   1. Release each PMS hold via `adapter.releaseHold` (mirrors the
 *      pre-tx hold-release-loop in `cancelDraft`, recon Summary 3).
 *   2. Cancel the Stripe PaymentIntent if one was attached to the
 *      session (reproduces the deleted `tryCancelStripePaymentIntent`
 *      from the pre-Phase-C lifecycle.ts; logic from commit `3c1dc00`).
 *
 * **Never throws.** Errors are collected and returned for observability
 * + caller logging. The caller is post-commit; an exception here cannot
 * un-do the commit, so swallowing-and-reporting is the only correct
 * behaviour.
 *
 * See `draft-orders-invoice-flow.md` v1.2 §6.2 step 7-8 and invariants
 * 8 + 9 (best-effort, logged).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

export interface RunUnlinkSideEffectsArgs {
  tenantId: string;
  draftOrderId: string;
  sessionId: string;
  releasedHoldExternalIds: string[];
  stripePaymentIntentId: string | null;
}

export interface UnlinkSideEffectsResult {
  /** Number of hold-release adapter calls attempted (incl. failures). */
  holdReleaseAttempted: number;
  /** Per-hold failure record. Empty on full success. */
  holdReleaseErrors: Array<{
    holdExternalId: string;
    error: string;
  }>;
  /** True iff a PI ID was provided and `stripe.paymentIntents.cancel` ran. */
  stripePaymentIntentCancelAttempted: boolean;
  /** Error message iff the PI cancel call threw; null on success / not-attempted. */
  stripePaymentIntentCancelError: string | null;
}

export async function runUnlinkSideEffects(
  args: RunUnlinkSideEffectsArgs,
): Promise<UnlinkSideEffectsResult> {
  const result: UnlinkSideEffectsResult = {
    holdReleaseAttempted: 0,
    holdReleaseErrors: [],
    stripePaymentIntentCancelAttempted: false,
    stripePaymentIntentCancelError: null,
  };

  // ── Step A — PMS hold release ───────────────────────────────────
  // Lazy-import the adapter resolver so test environments without
  // PMS env vars can import this module freely. Only loaded when at
  // least one hold needs releasing.
  if (args.releasedHoldExternalIds.length > 0) {
    try {
      const { resolveAdapter } = await import(
        "@/app/_lib/integrations/resolve"
      );
      const adapter = await resolveAdapter(args.tenantId);
      for (const holdExternalId of args.releasedHoldExternalIds) {
        result.holdReleaseAttempted += 1;
        try {
          await adapter.releaseHold(args.tenantId, holdExternalId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.holdReleaseErrors.push({ holdExternalId, error: msg });
          log("warn", "draft_invoice.hold_release_failed", {
            tenantId: args.tenantId,
            draftOrderId: args.draftOrderId,
            sessionId: args.sessionId,
            holdExternalId,
            error: msg,
          });
        }
      }
    } catch (err) {
      // Adapter resolution itself failed (tenant has no integration,
      // credentials malformed, etc.). Mark every hold as a release
      // failure with the resolution error so observability sees the
      // root cause.
      const msg = err instanceof Error ? err.message : String(err);
      log("warn", "draft_invoice.hold_release_resolve_failed", {
        tenantId: args.tenantId,
        draftOrderId: args.draftOrderId,
        sessionId: args.sessionId,
        error: msg,
      });
      for (const holdExternalId of args.releasedHoldExternalIds) {
        result.holdReleaseAttempted += 1;
        result.holdReleaseErrors.push({ holdExternalId, error: msg });
      }
    }
  }

  // ── Step B — Stripe PaymentIntent cancel ────────────────────────
  // Reproduces the deleted `tryCancelStripePaymentIntent` helper
  // (commit 3c1dc00) verbatim in shape: dev/test-mode skips Connect
  // params; non-dev attaches `stripeAccount` when the tenant is
  // onboarded; failures captured and logged but never thrown.
  if (args.stripePaymentIntentId !== null) {
    result.stripePaymentIntentCancelAttempted = true;
    try {
      const { getStripe } = await import("@/app/_lib/stripe/client");
      const stripe = getStripe();
      const tenant = await prisma.tenant.findUnique({
        where: { id: args.tenantId },
        select: { stripeAccountId: true, stripeOnboardingComplete: true },
      });
      const devOrTest =
        process.env.NODE_ENV === "development" ||
        (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
      const connectParams =
        !devOrTest && tenant?.stripeAccountId && tenant.stripeOnboardingComplete
          ? { stripeAccount: tenant.stripeAccountId }
          : undefined;
      await stripe.paymentIntents.cancel(
        args.stripePaymentIntentId,
        connectParams,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.stripePaymentIntentCancelError = msg;
      log("warn", "draft_invoice.pi_cancel_failed", {
        tenantId: args.tenantId,
        draftOrderId: args.draftOrderId,
        sessionId: args.sessionId,
        stripePaymentIntentId: args.stripePaymentIntentId,
        error: msg,
      });
    }
  }

  return result;
}
