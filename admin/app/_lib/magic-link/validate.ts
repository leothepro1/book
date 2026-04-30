import { prisma } from "@/app/_lib/db/prisma";

export type MagicLinkValidationResult =
  | { valid: true; tenantId: string; email: string }
  | { valid: false; reason: "not_found" | "expired" | "used" };

/**
 * Validate and consume a magic link token.
 *
 * The token is marked as used atomically before returning valid: true.
 * If a concurrent request uses the same token, the Prisma update will
 * see usedAt is already set and the second caller gets 'used'.
 */
export async function validateMagicLink(
  token: string,
): Promise<MagicLinkValidationResult> {
  // 1. Fetch token from DB
  const record = await prisma.magicLinkToken.findUnique({
    where: { token },
  });

  if (!record) {
    return { valid: false, reason: "not_found" };
  }

  // 2. Check if already used
  if (record.usedAt) {
    return { valid: false, reason: "used" };
  }

  // 3. Check if expired
  if (record.expiresAt < new Date()) {
    return { valid: false, reason: "expired" };
  }

  // 4. Mark as used — atomic, prevents race condition on double-click.
  //    If a concurrent request already used this token, this update
  //    will either fail or we re-check after update.
  const updated = await prisma.magicLinkToken.updateMany({
    where: {
      id: record.id,
      usedAt: null, // only update if still unused
    },
    data: { usedAt: new Date() },
  });

  // If no rows updated, another request consumed the token first
  if (updated.count === 0) {
    return { valid: false, reason: "used" };
  }

  // Analytics pipeline emit — guest_authenticated (Phase 2). Fire-and-forget.
  // Pairs with guest_otp_sent via the same token_id (sha256-16hex of the
  // token string) so Phase 5 can compute (sent → authenticated)
  // conversion rates.
  Promise.all([
    import("@/app/_lib/analytics/pipeline/emitter"),
    import("@/app/_lib/analytics/pipeline/integrations"),
    import("node:crypto"),
  ])
    .then(async ([{ emitAnalyticsEventStandalone }, { deriveGuestId }, { createHash }]) => {
      const tokenId = createHash("sha256").update(token).digest("hex").slice(0, 16);
      const emailHash = deriveGuestId({
        tenantId: record.tenantId,
        guestAccountId: null,
        guestEmail: record.email,
      });
      // Look up linked GuestAccount (may not exist yet — auth-then-create flow).
      const account = await prisma.guestAccount.findFirst({
        where: { tenantId: record.tenantId, email: record.email },
        select: { id: true },
      });
      await emitAnalyticsEventStandalone({
        tenantId: record.tenantId,
        eventName: "guest_authenticated",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: account?.id
          ? { actor_type: "guest", actor_id: account.id }
          : { actor_type: "anonymous", actor_id: null },
        payload: {
          guest_id: account?.id ?? null,
          email_hash: emailHash,
          token_id: tokenId,
          authenticated_at: new Date(),
        },
        idempotencyKey: `guest_authenticated:${tokenId}`,
      });
    })
    .catch(() => { /* fire-and-forget */ });

  // 5. Return valid result
  return { valid: true, tenantId: record.tenantId, email: record.email };
}

/**
 * Look up the tenant for a magic link token without consuming it.
 * Used by the legacy /auth/magic/[token] shim to find which tenant
 * subdomain to redirect to. Does NOT mark the token as used.
 *
 * Returns tenantId or null if token is invalid/expired/used.
 */
export async function lookupMagicLinkTenant(
  token: string,
): Promise<{ tenantId: string; email: string } | null> {
  const record = await prisma.magicLinkToken.findUnique({
    where: { token },
    select: { tenantId: true, email: true, usedAt: true, expiresAt: true },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < new Date()) return null;

  return { tenantId: record.tenantId, email: record.email };
}
