/**
 * Distributed rate limiter for checkout routes
 * ═════════════════════════════════════════════
 *
 * Backed by Upstash Redis — survives deploys, shared across
 * all Vercel instances and regions.
 *
 * Uses sliding window per IP. Callers pass (prefix, maxRequests, windowMs)
 * — the same signature as before so nothing else changes.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { headers } from "next/headers";
import { redis } from "@/app/_lib/redis/client";

// Cache of Ratelimit instances keyed by "prefix:max:window"
// Avoids recreating the same Ratelimit object on every call.
const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, maxRequests: number, windowMs: number): Ratelimit {
  const key = `${prefix}:${maxRequests}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
      analytics: true,
      prefix: `bedfront:ratelimit:${prefix}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Resolve client IP from X-Forwarded-For (first IP in chain = client).
 * Falls back to "unknown" if header is missing.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const firstIp = xff.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Check rate limit. Returns true if allowed, false if exceeded.
 * Signature matches the old in-memory implementation — callers change nothing.
 */
export async function checkRateLimit(
  prefix: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  const ip = await getClientIp();
  const identifier = `${prefix}:${ip}`;
  const limiter = getLimiter(prefix, maxRequests, windowMs);
  const { success } = await limiter.limit(identifier);
  return success;
}
