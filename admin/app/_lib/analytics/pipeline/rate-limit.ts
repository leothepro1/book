/**
 * Rate limiter for the public analytics-collect endpoint (Phase 3).
 *
 * Two layers, both Upstash-backed sliding windows:
 *
 *   ipLimiter      — per source IP. Catches a single misbehaving
 *                    visitor / abusive bot blast.
 *   tenantLimiter  — per tenant. Catches a coordinated flood (many
 *                    IPs hammering one tenant) before it reaches
 *                    the outbox and starves drainer throughput.
 *
 * The endpoint checks both. Either limiter can reject independently;
 * the response carries a `Retry-After: <seconds>` header derived from
 * whichever limiter fired (or the larger of the two if both did).
 *
 * ── Why we don't reuse `app/_lib/rate-limit/checkout.ts` ──────────────────
 *
 * That helper returns a plain boolean. The Phase 3 spec (Q6) requires
 * 429 + Retry-After, which means we need the limiter's `reset`
 * timestamp. Rather than widen the checkout helper's contract (which
 * is shared by 5+ commerce routes whose callers don't need the reset),
 * we keep that helper untouched and put the analytics limiter — which
 * needs the richer return shape — here.
 *
 * Both helpers share the same Upstash redis singleton and the same
 * `bedfront:ratelimit:` key prefix scheme, so analytics traffic never
 * collides with checkout traffic in the keyspace.
 */

import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/app/_lib/redis/client";

// ── Limiter cache ────────────────────────────────────────────────────────

const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, max: number, windowMs: number): Ratelimit {
  const key = `${prefix}:${max}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
      analytics: true,
      prefix: `bedfront:ratelimit:${prefix}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

// ── Public API ───────────────────────────────────────────────────────────

export interface AnalyticsRateLimitDecision {
  /** true → request allowed; false → reject with 429 + Retry-After. */
  allowed: boolean;
  /**
   * Seconds until the offending bucket resets. Caller passes this to
   * the `Retry-After` header. Always >= 1: HTTP clients treat 0 as
   * "retry immediately" which would just re-trigger the limit.
   */
  retryAfterSeconds: number;
  /**
   * Which limiter fired ("ip" or "tenant"), or "none" when allowed.
   * Used in structured logs so operators can distinguish a single
   * abusive IP from a tenant-wide flood.
   */
  scope: "none" | "ip" | "tenant";
}

const ALLOWED: AnalyticsRateLimitDecision = {
  allowed: true,
  retryAfterSeconds: 0,
  scope: "none",
};

/**
 * Check the analytics-collect rate limits for a (tenantId, ip) pair.
 *
 * Limits (chosen to absorb a busy storefront without becoming a DDoS
 * amplifier):
 *   IP:     120 events / 60s
 *   Tenant: 6000 events / 60s   (≈ 100/s — a single tenant cannot
 *                                 monopolise the drainer)
 *
 * Returns `{ allowed: true, ... }` in development to keep the test/dev
 * loop unconstrained. The endpoint also short-circuits earlier checks
 * in dev where applicable.
 */
export async function checkAnalyticsRateLimit(
  tenantId: string,
  ip: string,
): Promise<AnalyticsRateLimitDecision> {
  if (process.env.NODE_ENV === "development") return ALLOWED;

  const ipLimiter = getLimiter("analytics-collect-ip", 120, 60_000);
  const tenantLimiter = getLimiter("analytics-collect-tenant", 6000, 60_000);

  // Run both checks in parallel — they hit independent Redis keys.
  const [ipResult, tenantResult] = await Promise.all([
    ipLimiter.limit(`ip:${ip}`),
    tenantLimiter.limit(`tenant:${tenantId}`),
  ]);

  if (ipResult.success && tenantResult.success) return ALLOWED;

  // At least one fired. Pick the bucket that needs more time so the
  // Retry-After tells the client when BOTH limits will let them in.
  const now = Date.now();
  const ipWaitMs = ipResult.success ? 0 : Math.max(0, ipResult.reset - now);
  const tenantWaitMs = tenantResult.success ? 0 : Math.max(0, tenantResult.reset - now);
  const waitMs = Math.max(ipWaitMs, tenantWaitMs);
  // Round up; ensure at least 1s so the client doesn't tight-loop.
  const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));

  const scope: "ip" | "tenant" = !ipResult.success && ipWaitMs >= tenantWaitMs ? "ip" : "tenant";

  return { allowed: false, retryAfterSeconds, scope };
}
