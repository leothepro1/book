import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type ClaimResult =
  | { claimed: true }
  | { claimed: false; status: "PROCESSING" }
  | { claimed: false; status: "COMPLETED"; responsePayload: unknown }
  | { claimed: false; status: "FAILED" };

/**
 * Attempt to claim an idempotency key. Returns { claimed: true } if this
 * is a new request, or the existing state if the key was already claimed.
 */
export async function claimIdempotencyKey(
  tenantId: string,
  key: string,
  routeType: string,
): Promise<ClaimResult> {
  const existing = await prisma.checkoutIdempotencyKey.findFirst({
    where: { tenantId, key, routeType, expiresAt: { gt: new Date() } },
  });

  if (existing) {
    if (existing.status === "COMPLETED") {
      return { claimed: false, status: "COMPLETED", responsePayload: existing.responsePayload };
    }
    if (existing.status === "FAILED") {
      // Failed keys can be retried — delete and re-claim
      await prisma.checkoutIdempotencyKey.delete({ where: { id: existing.id } });
    } else {
      return { claimed: false, status: "PROCESSING" };
    }
  }

  try {
    await prisma.checkoutIdempotencyKey.create({
      data: {
        tenantId,
        key,
        routeType,
        status: "PROCESSING",
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
    return { claimed: true };
  } catch (err: unknown) {
    // Unique constraint race — another request claimed it
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint")) {
      return { claimed: false, status: "PROCESSING" };
    }
    log("error", "idempotency.claim_error", { tenantId, key, routeType, error: message });
    throw err;
  }
}

/**
 * Mark an idempotency key as completed with the response payload.
 * Subsequent requests with the same key return this payload directly.
 */
export async function completeIdempotencyKey(
  tenantId: string,
  key: string,
  routeType: string,
  responsePayload: unknown,
): Promise<void> {
  await prisma.checkoutIdempotencyKey.updateMany({
    where: { tenantId, key, routeType },
    data: { status: "COMPLETED", responsePayload: responsePayload as never },
  });
}

/**
 * Mark an idempotency key as failed so it can be retried.
 */
export async function failIdempotencyKey(
  tenantId: string,
  key: string,
  routeType: string,
): Promise<void> {
  await prisma.checkoutIdempotencyKey.updateMany({
    where: { tenantId, key, routeType },
    data: { status: "FAILED" },
  });
}
