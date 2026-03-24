/**
 * In-memory rate limiter for checkout routes
 * ═══════════════════════════════════════════
 *
 * Sliding window per IP. Resets on deploy/restart.
 * Production recommendation: replace with Upstash Ratelimit + Redis.
 *
 * Uses X-Forwarded-For first IP (client IP behind Vercel edge).
 */

import { headers } from "next/headers";

interface Window {
  timestamps: number[];
}

const store = new Map<string, Window>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, win] of store) {
    win.timestamps = win.timestamps.filter((t) => t > cutoff);
    if (win.timestamps.length === 0) store.delete(key);
  }
}

/**
 * Resolve client IP from X-Forwarded-For (first IP in chain = client).
 * Falls back to "unknown" if header is missing.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    // First IP in chain is the original client
    const firstIp = xff.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  // Fallback — should not happen on Vercel
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Check rate limit. Returns true if allowed, false if exceeded.
 * Disabled in development to avoid blocking during testing.
 */
export async function checkRateLimit(
  prefix: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  cleanup(windowMs);

  const ip = await getClientIp();
  const key = `${prefix}:${ip}`;
  const now = Date.now();
  const cutoff = now - windowMs;

  let win = store.get(key);
  if (!win) {
    win = { timestamps: [] };
    store.set(key, win);
  }

  // Prune expired timestamps
  win.timestamps = win.timestamps.filter((t) => t > cutoff);

  if (win.timestamps.length >= maxRequests) {
    return false; // Rate limited
  }

  win.timestamps.push(now);
  return true;
}
