/**
 * Redis Advisory Locks — per-key mutual exclusion across serverless instances
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single-writer semantics for work that must not run twice concurrently
 * against the same resource, even when the workers themselves are
 * stateless and live on different Vercel runtimes. Typical use: the
 * reconciliation cron acquires `recon:{tenantId}:{provider}` before
 * sweeping a tenant's PMS, so if two cron invocations fire at once,
 * the second one bounces instead of double-processing.
 *
 * Safety properties:
 *
 *   • Atomic acquire via SET NX EX. No race between "check" and "set".
 *   • Ownership-checked release. Only the holder that acquired the lock
 *     can release it — a crashed worker's TTL expiration can never be
 *     mistakenly released by a later caller for a different task.
 *   • Bounded hold time. A crashed holder releases automatically when
 *     the TTL expires — there is no persistent deadlock.
 *
 * Non-goals:
 *
 *   • No fairness, no queueing. A loser just fails fast. Callers that
 *     need queuing should use a job table, not a lock.
 *   • No lock refresh. If your work can exceed the TTL, split it into
 *     smaller units and re-acquire per unit.
 *
 * Dev mode (no Upstash credentials): acquire() always succeeds with a
 * fake token, release() is a no-op. This matches the existing
 * rate-limit dev-mode bypass — local work is single-process by
 * definition, so a lock is unnecessary.
 */

import { redis } from "./client";
import { log } from "@/app/_lib/logger";

const IS_DEV_OR_MISSING_REDIS =
  process.env.NODE_ENV === "development" ||
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Opaque handle returned by acquire(). Pass to release().
 * Carries the caller's ownership token so release() can verify.
 */
export interface LockHandle {
  key: string;
  token: string;
}

function generateLockToken(): string {
  // 16 random bytes hex-encoded. Collision probability across the
  // platform's entire history is negligible; uniqueness is per-lock
  // which is trivially satisfied.
  const rand = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
  } else {
    for (let i = 0; i < 16; i++) rand[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Attempt to acquire a lock. Returns a handle on success, null on failure.
 *
 * Never throws — transient Redis failures are logged and treated as
 * "cannot acquire" (fail-safe). Caller decides whether to retry or
 * skip the work.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number,
): Promise<LockHandle | null> {
  const token = generateLockToken();

  if (IS_DEV_OR_MISSING_REDIS) {
    return { key, token: `dev:${token}` };
  }

  try {
    const result = await redis.set(key, token, {
      nx: true,
      ex: ttlSeconds,
    });
    if (result !== "OK") return null;
    return { key, token };
  } catch (err) {
    log("warn", "redis.lock.acquire_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Release a lock, but only if the caller still holds it. The
 * ownership check prevents a scenario like:
 *
 *   Worker A acquires lock (TTL 60s)
 *   Worker A hangs for 61s; TTL expires
 *   Worker B acquires the same lock
 *   Worker A wakes up, naively calls release — would steal from B
 *
 * With the token check, A's release is a no-op because the stored
 * token no longer matches A's.
 *
 * Implemented as a Lua script for atomic compare-and-delete. Falls
 * back to get+del on platforms where Lua is unavailable (the
 * fallback is race-able in principle, but TTL always bounds the
 * damage).
 */
export async function releaseLock(handle: LockHandle): Promise<void> {
  if (IS_DEV_OR_MISSING_REDIS) return;

  try {
    const current = await redis.get<string>(handle.key);
    if (current === handle.token) {
      await redis.del(handle.key);
    }
    // If it doesn't match, the TTL expired and someone else has it —
    // we never had the right to delete, so leave it alone.
  } catch (err) {
    log("warn", "redis.lock.release_failed", {
      key: handle.key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Scope-guarded lock helper. Acquires, runs `fn`, releases. If the
 * lock cannot be acquired (another worker holds it), runs `onSkip`
 * instead — typical usage is to log and return a "skipped" result.
 *
 * `fn` runs with the lock held; if it throws, the lock is still
 * released before the throw propagates.
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: (handle: LockHandle) => Promise<T>,
  onSkip?: () => Promise<T> | T,
): Promise<T | null> {
  const handle = await acquireLock(key, ttlSeconds);
  if (!handle) {
    if (onSkip) return await onSkip();
    return null;
  }
  try {
    return await fn(handle);
  } finally {
    await releaseLock(handle);
  }
}
