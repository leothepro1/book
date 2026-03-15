/**
 * Database-backed Rate Limiter for Mews API
 *
 * Token bucket algorithm persisted in PostgreSQL.
 * Survives serverless cold starts — shared across all invocations.
 *
 * Mews limit: 200 requests per AccessToken per 30 seconds.
 * Key is SHA-256(accessToken)[0:16] — never stores the raw token.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/app/_lib/db/prisma";

const MAX_TOKENS = 200;
const REFILL_WINDOW_SECONDS = 30;
const REFILL_RATE = MAX_TOKENS / REFILL_WINDOW_SECONDS; // tokens per second
const MAX_WAIT_MS = 10_000; // never wait more than 10 seconds

function hashToken(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Consume one rate limit token for the given accessToken.
 * Waits if the bucket is empty (up to MAX_WAIT_MS).
 * Throws if wait would exceed MAX_WAIT_MS.
 */
export async function consumeRateLimit(accessToken: string): Promise<void> {
  const key = `mews:${hashToken(accessToken)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await prisma.$transaction(async (tx) => {
      // Load or create
      let bucket = await tx.rateLimit.findUnique({ where: { key } });

      if (!bucket) {
        bucket = await tx.rateLimit.create({
          data: { key, tokens: MAX_TOKENS, lastRefill: new Date() },
        });
      }

      // Refill based on elapsed time
      const now = new Date();
      const elapsedSeconds = (now.getTime() - bucket.lastRefill.getTime()) / 1000;
      const refilled = Math.min(MAX_TOKENS, bucket.tokens + elapsedSeconds * REFILL_RATE);

      if (refilled < 1) {
        // Not enough tokens — calculate wait time
        const waitSeconds = (1 - refilled) / REFILL_RATE;
        const waitMs = Math.ceil(waitSeconds * 1000);
        return { consumed: false, waitMs } as const;
      }

      // Consume one token
      await tx.rateLimit.update({
        where: { key },
        data: { tokens: refilled - 1, lastRefill: now },
      });

      return { consumed: true, waitMs: 0 } as const;
    });

    if (result.consumed) return;

    // Need to wait
    if (result.waitMs > MAX_WAIT_MS) {
      throw new Error(
        `Rate limit exceeded — would need to wait ${result.waitMs}ms (max ${MAX_WAIT_MS}ms)`,
      );
    }

    await sleep(result.waitMs + 50); // small buffer
    // Retry after wait
  }
}
