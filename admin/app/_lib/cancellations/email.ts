/**
 * Cancellation engine — outbound email.
 *
 * Wraps sendEmailEvent() with a fail-open shell that matches the
 * platform's "email failures never abort the surrounding flow" rule
 * (CLAUDE.md → Email invariants #2–3). The saga calls this after it
 * has persisted the CLOSED state; an email failure here must not
 * re-open or invalidate the cancellation.
 *
 * Returns:
 *   { ok: true,  result }                — Resend accepted the message
 *   { ok: false, skipped: true }         — rate-limited or unsubscribed (fail-open)
 *   { ok: false, skipped: false, error } — send genuinely errored (log + continue)
 */

import { sendEmailEvent, type EmailSendResult } from "@/app/_lib/email/send";
import { log } from "@/app/_lib/logger";

export type CancellationEmailOutcome =
  | { ok: true; result: EmailSendResult }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

export async function sendBookingCancelledEmail(params: {
  tenantId: string;
  to: string;
  variables: {
    guestName: string;
    hotelName: string;
    bookingRef: string;
    cancellationReason: string;
    refundAmount: string;
    feeAmount: string;
    currency: string;
    checkIn: string;
    checkOut: string;
  };
}): Promise<CancellationEmailOutcome> {
  try {
    const result = await sendEmailEvent(
      params.tenantId,
      "BOOKING_CANCELLED",
      params.to,
      params.variables,
    );

    if (result.status === "sent") {
      return { ok: true, result };
    }

    // Log-and-continue paths.
    //   rate_limited | skipped_unsubscribed | event_disabled  → skipped (expected)
    //   failed                                                  → treated as non-blocking error
    if (result.status === "failed") {
      const errMessage =
        result.error instanceof Error
          ? result.error.message
          : String(result.error);
      log("error", "cancellation.email.failed", {
        tenantId: params.tenantId,
        error: errMessage,
      });
      return { ok: false, skipped: false, error: errMessage };
    }

    log("info", "cancellation.email.skipped", {
      tenantId: params.tenantId,
      status: result.status,
    });
    return { ok: false, skipped: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "cancellation.email.failed", {
      tenantId: params.tenantId,
      error: message,
    });
    return { ok: false, skipped: false, error: message };
  }
}
