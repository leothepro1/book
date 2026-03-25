/**
 * Email Rate Limiting
 * ═══════════════════
 *
 * Per-recipient, per-event-type throttle to prevent email bombing.
 * Uses an append-only send log — count rows in a rolling window.
 *
 * This is the last line of defense. The dedup fields on Booking
 * (confirmedEmailSentAt, etc.) prevent most duplicates, but a bug
 * that clears those fields could bypass them. Rate limiting catches it.
 *
 * Fail-open: if the rate limit check itself fails (DB error), the
 * send is allowed. Availability over perfect limiting.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { EmailEventType } from "./registry";

interface RateLimitConfig {
  maxCount: number;
  windowMs: number;
}

const RATE_LIMITS: Record<EmailEventType, RateLimitConfig> = {
  MAGIC_LINK:          { maxCount: 3,  windowMs: 15 * 60 * 1000 },
  BOOKING_CONFIRMED:   { maxCount: 1,  windowMs: 24 * 60 * 60 * 1000 },
  BOOKING_CANCELLED:   { maxCount: 2,  windowMs: 24 * 60 * 60 * 1000 },
  CHECK_IN_CONFIRMED:  { maxCount: 1,  windowMs: 24 * 60 * 60 * 1000 },
  CHECK_OUT_CONFIRMED: { maxCount: 1,  windowMs: 24 * 60 * 60 * 1000 },
  SUPPORT_REPLY:       { maxCount: 20, windowMs: 24 * 60 * 60 * 1000 },
  GUEST_OTP:           { maxCount: 3,  windowMs: 15 * 60 * 1000 },
  ORDER_CONFIRMED:     { maxCount: 1,  windowMs: 24 * 60 * 60 * 1000 },
  GIFT_CARD_SENT:      { maxCount: 1,  windowMs: 7 * 24 * 60 * 60 * 1000 }, // 1 per 7 days per key
};

/**
 * Returns true if the email is allowed to be sent.
 * Returns false if the rate limit has been reached.
 * Never throws — rate limit failures must not block sends.
 */
export async function checkEmailRateLimit(
  tenantId: string,
  email: string,
  eventType: EmailEventType,
): Promise<boolean> {
  try {
    const config = RATE_LIMITS[eventType];
    const windowStart = new Date(Date.now() - config.windowMs);

    const count = await prisma.emailRateLimit.count({
      where: {
        tenantId,
        email,
        eventType,
        sentAt: { gte: windowStart },
      },
    });

    return count < config.maxCount;
  } catch (error) {
    // If rate limit check fails, allow the send — availability
    // over perfect limiting. Log for investigation.
    console.error("[email-rate-limit] Check failed, allowing send:", error);
    return true;
  }
}

/**
 * Records a send. Called after sendEmailEvent() succeeds.
 * Never throws.
 */
export async function recordEmailSend(
  tenantId: string,
  email: string,
  eventType: EmailEventType,
): Promise<void> {
  try {
    await prisma.emailRateLimit.create({
      data: { tenantId, email, eventType },
    });
  } catch (error) {
    console.error("[email-rate-limit] Record failed:", error);
  }
}

/**
 * Cleanup: delete records older than the longest window (24h).
 * Called from the daily cleanup cron at /api/integrations/cleanup.
 */
export async function cleanupEmailRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.emailRateLimit.deleteMany({
    where: { sentAt: { lt: cutoff } },
  });
  return result.count;
}
