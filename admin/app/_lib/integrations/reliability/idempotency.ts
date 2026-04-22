/**
 * PMS Idempotency Key Layer
 * ═══════════════════════════
 *
 * Prevents the canonical PMS failure mode: "we called the PMS, the
 * network timed out, the PMS actually completed the operation, our
 * retry repeated it and created a duplicate."
 *
 * Every PMS call that mutates state (createBooking, holdAvailability,
 * cancelBooking) is wrapped in `withIdempotency`. The first call with
 * a given key claims an IN_FLIGHT row, executes, stores the result
 * as COMPLETED, and returns. A second call with the same key sees
 * the existing row and returns the cached result — no PMS re-hit.
 *
 * Key derivation is deterministic and caller-owned: `computeKey`
 * hashes (tenantId, operation, canonicalized inputs). The same
 * retry therefore always generates the same key. Different retries
 * of the same logical operation (e.g. outbound job retries for the
 * same order) share the key and dedup correctly.
 *
 * Storage is DB-backed (PmsIdempotencyKey table, 48-hour TTL). We
 * don't use Redis here because the guarantee must survive Redis
 * restarts — losing a COMPLETED marker would allow a duplicate PMS
 * call, which is exactly the failure mode we're preventing.
 *
 * Concurrent callers serialize correctly:
 *   Worker A: creates IN_FLIGHT row, starts work
 *   Worker B: hits unique-constraint collision, polls the row
 *   Worker A: writes COMPLETED + result
 *   Worker B: sees COMPLETED and returns cached result
 *
 * Error handling:
 *   - If the wrapped fn throws, the row is marked FAILED with the
 *     error. Subsequent callers get the same error (via rethrow).
 *     This is the correct default: if the PMS rejected the booking
 *     with "guest email invalid", we don't want retries to think
 *     they might succeed.
 *   - Callers that WANT to retry after failure (e.g. transient
 *     5xx) should supply a distinct key — typically via attempt
 *     number mixed into the input. This is explicit: by default,
 *     idempotency keys are terminal.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { log } from "@/app/_lib/logger";

// ── Key computation ─────────────────────────────────────────
//
// Deterministic, order-independent for objects: sorts object keys
// so `{a:1,b:2}` and `{b:2,a:1}` hash identically. Arrays preserve
// order (sequences are semantically meaningful — e.g. adon list).

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return `D:${value.toISOString()}`;
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface IdempotencyKeyInput {
  tenantId: string;
  provider: string;
  operation: string;
  /** Arbitrary object. Canonicalized deterministically before hashing. */
  inputs: Record<string, unknown>;
}

export function computeIdempotencyKey(params: IdempotencyKeyInput): string {
  const canonical = canonicalize({
    t: params.tenantId,
    p: params.provider,
    o: params.operation,
    i: params.inputs,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ── Claim / wait / store machinery ──────────────────────────

type Row = {
  id: string;
  status: string;
  resultJson: Prisma.JsonValue | null;
};

type WithIdempotencyOptions = {
  tenantId: string;
  provider: string;
  operation: string;
  /** Max time (ms) to poll a concurrent IN_FLIGHT call before giving up. */
  waitMaxMs?: number;
  /** Poll interval. */
  waitStepMs?: number;
};

const DEFAULT_WAIT_MAX_MS = 30_000;
const DEFAULT_WAIT_STEP_MS = 250;

/**
 * Run `fn()` exactly once per `key`. Concurrent or subsequent calls
 * with the same key return the stored result of the original call.
 *
 * Throws if the wrapped fn throws on the first call (and rethrows
 * the same error on subsequent calls, stored as FAILED). Callers
 * that want to retry a FAILED key must use a distinct key.
 */
export async function withIdempotency<T>(
  key: string,
  opts: WithIdempotencyOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const waitMaxMs = opts.waitMaxMs ?? DEFAULT_WAIT_MAX_MS;
  const waitStepMs = opts.waitStepMs ?? DEFAULT_WAIT_STEP_MS;

  // Step 1: try to claim IN_FLIGHT. The unique constraint on `key`
  // makes this the atomic primitive — only one caller creates the
  // row, everyone else collides and polls.
  let claimedId: string | null = null;
  try {
    const claimed = await prisma.pmsIdempotencyKey.create({
      data: {
        key,
        tenantId: opts.tenantId,
        provider: opts.provider,
        operation: opts.operation,
        status: "IN_FLIGHT",
      },
      select: { id: true },
    });
    claimedId = claimed.id;
  } catch (err) {
    if (
      !(err instanceof Prisma.PrismaClientKnownRequestError) ||
      err.code !== "P2002"
    ) {
      throw err;
    }
    // Key already exists — we're a follower. Skip to the polling
    // path below to pick up the first caller's result.
  }

  if (claimedId !== null) {
    // We own this key. Execute and record.
    try {
      const result = await fn();
      await prisma.pmsIdempotencyKey.update({
        where: { id: claimedId },
        data: {
          status: "COMPLETED",
          resultJson: serializeResult(result),
          completedAt: new Date(),
        },
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.pmsIdempotencyKey
        .update({
          where: { id: claimedId },
          data: {
            status: "FAILED",
            resultJson: { error: msg },
            completedAt: new Date(),
          },
        })
        .catch(() => {
          // Best-effort. If the FAILED write itself fails, the row
          // stays IN_FLIGHT and will be cleaned up by the cron after
          // 48h. Callers will block-poll for `waitMaxMs` and then
          // proceed to retry — which is the correct fallback.
        });
      throw err;
    }
  }

  // Step 2: follower path — poll until the row hits a terminal state
  // or our wait budget expires.
  const deadline = Date.now() + waitMaxMs;
  let lastSeen: Row | null = null;

  while (Date.now() < deadline) {
    const row = await prisma.pmsIdempotencyKey.findUnique({
      where: { key },
      select: { id: true, status: true, resultJson: true },
    });

    if (!row) {
      // Extremely unlikely — would mean the claimer rolled back
      // before we polled. Treat as "no one has this" and retry
      // the claim.
      log("warn", "pms.idempotency.follower_saw_no_row", { key });
      break;
    }
    lastSeen = row;

    if (row.status === "COMPLETED") {
      return deserializeResult(row.resultJson) as T;
    }
    if (row.status === "FAILED") {
      const err = row.resultJson as { error?: string } | null;
      throw new Error(
        `Idempotency-cached failure: ${err?.error ?? "unknown"}`,
      );
    }
    // still IN_FLIGHT — back off and retry
    await sleep(waitStepMs);
  }

  // Polling timed out. The first caller is stuck or the row is
  // orphaned. Safer to fail loudly than return a stale or wrong
  // result — callers decide retry strategy (e.g. after cleanup).
  log("error", "pms.idempotency.wait_timeout", {
    key,
    waitMaxMs,
    lastStatus: lastSeen?.status ?? null,
  });
  throw new Error(
    `Idempotency wait timeout after ${waitMaxMs}ms for key ${key.slice(0, 16)}…`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeResult(value: unknown): Prisma.InputJsonValue {
  // Prisma JSON fields don't accept `undefined`, and Dates need to
  // become ISO strings. We walk the value to normalize.
  const walk = (v: unknown): unknown => {
    if (v === undefined) return null;
    if (v instanceof Date) return { __date: v.toISOString() };
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v)) out[k] = walk(inner);
      return out;
    }
    return v;
  };
  return walk(value) as Prisma.InputJsonValue;
}

function deserializeResult(value: Prisma.JsonValue | null): unknown {
  const walk = (v: unknown): unknown => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if (typeof obj.__date === "string") return new Date(obj.__date);
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(obj)) out[k] = walk(inner);
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    return v;
  };
  return walk(value);
}
