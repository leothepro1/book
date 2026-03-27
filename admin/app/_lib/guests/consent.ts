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
  const eventType = state === "SUBSCRIBED" ? "MARKETING_SUBSCRIBED" : "MARKETING_UNSUBSCRIBED";
  prisma.guestAccountEvent.create({
    data: {
      tenantId,
      guestAccountId,
      type: eventType,
      message: state === "SUBSCRIBED"
        ? "Prenumeration på marknadsföringsmail aktiverad"
        : "Avregistrerad från marknadsföringsmail",
      actorUserId: options.actorUserId ?? null,
      metadata: { source: options.source ?? "manual" },
    },
  }).catch(() => {});

  log("info", "guest.consent.updated", {
    tenantId, guestAccountId, state, source: options.source ?? "manual",
  });

  return { success: true };
}
