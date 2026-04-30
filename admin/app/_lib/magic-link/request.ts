"use server";

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { sendEmailEvent } from "@/app/_lib/email";
import { generateToken, getExpiryDate, EXPIRY_HUMAN } from "./tokens";
import { getTenantUrl } from "@/app/_lib/tenant/tenant-url";

const emailSchema = z.string().email();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 3;

/**
 * Request a magic link for guest portal authentication.
 *
 * Called when a guest submits their email on the portal login page.
 * Rate-limited to 3 requests per 15 minutes per email+tenant.
 * Always returns success to the guest — never reveals backend errors.
 */
export async function requestMagicLink(
  tenantId: string,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Validate email format
  const parsed = emailSchema.safeParse(email.toLowerCase().trim());
  if (!parsed.success) {
    return { success: false, error: "Ogiltig e-postadress" };
  }
  const normalizedEmail = parsed.data;

  // 2. Rate limit: max 3 tokens per email per 15 minutes
  // Note: sendEmailEvent() also enforces a matching rate limit
  // for MAGIC_LINK as a second layer of protection.
  const recentCount = await prisma.magicLinkToken.count({
    where: {
      tenantId,
      email: normalizedEmail,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  });

  if (recentCount >= RATE_LIMIT_MAX) {
    return {
      success: false,
      error: "För många försök. Vänta en stund och försök igen.",
    };
  }

  try {
    // 3. Invalidate previous unused tokens for this email + tenant
    await prisma.magicLinkToken.updateMany({
      where: {
        tenantId,
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() }, // expire immediately
    });

    // 4. Generate new token
    const token = generateToken();
    const expiresAt = getExpiryDate();

    // 5. Store token
    await prisma.magicLinkToken.create({
      data: { tenantId, email: normalizedEmail, token, expiresAt },
    });

    // Analytics pipeline emit — guest_otp_sent (Phase 2). Fire-and-forget.
    // The token itself is NEVER included; we hash it to a stable correlation
    // key so the matching guest_authenticated event can be paired in
    // Phase 5's authentication-funnel aggregations.
    Promise.all([
      import("@/app/_lib/analytics/pipeline/emitter"),
      import("@/app/_lib/analytics/pipeline/integrations"),
      import("node:crypto"),
    ])
      .then(async ([{ emitAnalyticsEventStandalone }, { deriveGuestId }, { createHash }]) => {
        const tokenId = createHash("sha256").update(token).digest("hex").slice(0, 16);
        const emailHash = deriveGuestId({
          tenantId,
          guestAccountId: null,
          guestEmail: normalizedEmail,
        });
        await emitAnalyticsEventStandalone({
          tenantId,
          eventName: "guest_otp_sent",
          schemaVersion: "0.1.0",
          occurredAt: new Date(),
          actor: { actor_type: "anonymous", actor_id: null },
          payload: {
            email_hash: emailHash,
            token_id: tokenId,
            expires_at: expiresAt,
            sent_at: new Date(),
          },
          idempotencyKey: `guest_otp_sent:${tokenId}`,
        });
      })
      .catch(() => { /* fire-and-forget */ });

    // 6. Fetch tenant for name + portalSlug
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, portalSlug: true },
    });

    // 7. Build magic link URL — points to tenant subdomain login page
    let magicLink: string;
    if (tenant.portalSlug) {
      magicLink = getTenantUrl(tenant, { path: `/login?ml=${token}` });
    } else {
      // Dev fallback: no portalSlug yet — use legacy URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      magicLink = `${appUrl}/login?ml=${token}`;
      console.warn("[magic-link] Tenant has no portalSlug, using fallback URL");
    }

    // 8. Send email — tenant name fetched in step 6
    await sendEmailEvent(tenantId, "MAGIC_LINK", normalizedEmail, {
      guestName: "", // unknown at this point — template handles empty gracefully
      hotelName: tenant.name,
      magicLink,
      expiresIn: EXPIRY_HUMAN,
    });
  } catch (err) {
    // Never reveal backend errors to the guest.
    // Token is already created — guest can request another if email doesn't arrive.
    console.error("[magic-link] Failed to send magic link:", err);
  }

  // 9. Always return success — do not reveal whether email exists or send failed
  return { success: true };
}
