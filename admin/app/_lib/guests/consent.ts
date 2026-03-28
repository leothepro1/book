/**
 * Guest Marketing Consent — GDPR-compliant consent management.
 *
 * Syncs bidirectionally with the legacy EmailUnsubscribe table
 * to maintain backwards compatibility with existing unsubscribe links.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { GuestMarketingState, GuestOptInLevel } from "@prisma/client";

export async function updateEmailConsent(
  tenantId: string,
  guestAccountId: string,
  state: "SUBSCRIBED" | "UNSUBSCRIBED",
  options: {
    source?: string;
    optInLevel?: "SINGLE_OPT_IN" | "CONFIRMED_OPT_IN";
    actorUserId?: string;
  } = {},
): Promise<{ success: boolean }> {
  const account = await prisma.guestAccount.update({
    where: { id: guestAccountId },
    data: {
      emailMarketingState: state as GuestMarketingState,
      emailConsentedAt: new Date(),
      emailConsentSource: options.source ?? "manual",
      emailOptInLevel: (options.optInLevel ?? "SINGLE_OPT_IN") as GuestOptInLevel,
    },
    select: { email: true },
  });

  // Sync legacy EmailUnsubscribe table
  if (state === "SUBSCRIBED") {
    await prisma.emailUnsubscribe.deleteMany({
      where: { tenantId, email: account.email },
    }).catch(() => {});
  } else {
    await prisma.emailUnsubscribe.upsert({
      where: { tenantId_email: { tenantId, email: account.email } },
      update: {},
      create: { tenantId, email: account.email },
    }).catch(() => {});
  }

  // Audit event
  const eventType = state === "SUBSCRIBED" ? "MARKETING_SUBSCRIBED" as const : "MARKETING_UNSUBSCRIBED" as const;
  const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
  await createGuestAccountEvent({
    guestAccountId,
    tenantId,
    type: eventType,
    message: state === "SUBSCRIBED"
      ? "Prenumeration på marknadsföringsmail aktiverad"
      : "Avregistrerad från marknadsföringsmail",
    actorUserId: options.actorUserId,
    metadata: { source: options.source ?? "manual" },
  });

  log("info", "guest.consent.updated", {
    tenantId, guestAccountId, state, source: options.source ?? "manual",
  });

  // Send double opt-in confirmation email if CONFIRMED_OPT_IN level
  if (state === "SUBSCRIBED" && options.optInLevel === "CONFIRMED_OPT_IN") {
    try {
      const guest = await prisma.guestAccount.findUnique({
        where: { id: guestAccountId },
        select: { email: true, firstName: true },
      });
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, portalSlug: true },
      });
      if (guest && tenant) {
        const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "bedfront.com";
        const portalBase = tenant.portalSlug ? `https://${tenant.portalSlug}.${baseDomain}` : "";
        const { sendEmailEvent } = await import("@/app/_lib/email/send");
        await sendEmailEvent(
          tenantId,
          "MARKETING_OPT_IN_CONFIRM" as Parameters<typeof sendEmailEvent>[1],
          guest.email,
          {
            guestName: guest.firstName ?? guest.email,
            hotelName: tenant.name,
            confirmUrl: `${portalBase}/portal/account`,
            unsubscribeUrl: `${portalBase}/unsubscribe`,
          },
        );
      }
    } catch (err) {
      log("error", "guest.consent.opt_in_email_failed", {
        tenantId, guestAccountId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Segment sync — marketing_consent changed (non-blocking)
  import("@/app/_lib/segments/sync").then(({ syncGuestSegments }) =>
    syncGuestSegments(guestAccountId, tenantId),
  ).catch((err) => log("warn", "guest.consent.segment_sync_failed", { tenantId, guestAccountId, error: String(err) }));

  return { success: true };
}
