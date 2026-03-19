"use server";

import { headers } from "next/headers";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant";
import { getCheckinCardConfig } from "@/app/_lib/pages/config";
import type { CheckinCardConfig } from "@/app/_lib/checkin-cards/types";

// ── Types ──────────────────────────────────────────────────

export type CheckinSettings = {
  checkinEnabled: boolean;
  earlyCheckinEnabled: boolean;
  earlyCheckinDays: number;
  checkinUrl: string;
};

export type IntegrationPrerequisite = {
  connected: boolean;
  providerName: string | null;
  reason: string | null;
};

export type CheckInPrerequisiteStatus = {
  pms: IntegrationPrerequisite;
  digitalLock: IntegrationPrerequisite;
  allMet: boolean;
};

// ── getCheckinSettings ───────────────────────────────────────

export async function getCheckinSettings(): Promise<CheckinSettings | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const checkinUrl = `${protocol}://${host}/check-in`;

  return {
    checkinEnabled: tenantData.tenant.checkinEnabled,
    earlyCheckinEnabled: tenantData.tenant.earlyCheckinEnabled,
    earlyCheckinDays: tenantData.tenant.earlyCheckinDays,
    checkinUrl,
  };
}

/** Maps provider ID to display name */
const PROVIDER_NAMES: Record<string, string> = {
  mews: "Mews",
  apaleo: "Apaleo",
  opera: "Opera",
  manual: "Manuell",
  fake: "Fake PMS",
};

function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

const LOCK_PROVIDER_NAMES: Record<string, string> = {
  salto: "Salto",
  assa_abloy: "Assa Abloy",
  nuki: "Nuki",
  manual: "Manuell",
  fake: "Fake Lock",
};

function lockProviderDisplayName(provider: string): string {
  return LOCK_PROVIDER_NAMES[provider] ?? provider;
}

// ── getCheckInPrerequisiteStatus ─────────────────────────────

export async function getCheckInPrerequisiteStatus(): Promise<CheckInPrerequisiteStatus> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return {
      pms: { connected: false, providerName: null, reason: "Inte inloggad" },
      digitalLock: { connected: false, providerName: null, reason: "Inte inloggad" },
      allMet: false,
    };
  }

  // ── PMS check ──
  let pms: IntegrationPrerequisite;

  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: tenantData.tenant.id },
    select: {
      provider: true,
      status: true,
      lastSyncAt: true,
      credentialsEncrypted: true,
    },
  });

  if (!integration) {
    pms = { connected: false, providerName: null, reason: "Ingen leverantör ansluten" };
  } else if (!integration.credentialsEncrypted) {
    pms = { connected: false, providerName: providerDisplayName(integration.provider), reason: "API-nyckel saknas" };
  } else if (integration.status === "pending") {
    pms = { connected: false, providerName: providerDisplayName(integration.provider), reason: "Anslutningen är inte verifierad" };
  } else if (integration.status === "error") {
    pms = { connected: false, providerName: providerDisplayName(integration.provider), reason: "Anslutningen har ett fel — kontrollera integrationen" };
  } else if (integration.status === "disconnected") {
    pms = { connected: false, providerName: providerDisplayName(integration.provider), reason: "Integrationen är frånkopplad" };
  } else if (integration.status === "active") {
    // Check last sync freshness (24h)
    if (integration.lastSyncAt) {
      const hoursSinceSync = (Date.now() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync > 24) {
        pms = { connected: false, providerName: providerDisplayName(integration.provider), reason: "Senaste synk för länge sedan — kontrollera anslutningen" };
      } else {
        pms = { connected: true, providerName: providerDisplayName(integration.provider), reason: null };
      }
    } else {
      // Active but never synced — still OK, just connected
      pms = { connected: true, providerName: providerDisplayName(integration.provider), reason: null };
    }
  } else {
    pms = { connected: false, providerName: providerDisplayName(integration.provider), reason: "Okänd status" };
  }

  // ── Digital lock check ──
  let digitalLock: IntegrationPrerequisite;

  const lockIntegration = await prisma.tenantLockIntegration.findUnique({
    where: { tenantId: tenantData.tenant.id },
    select: {
      provider: true,
      status: true,
      lastTestedAt: true,
      credentialsEncrypted: true,
    },
  });

  if (!lockIntegration) {
    digitalLock = { connected: false, providerName: null, reason: "Ingen leverantör ansluten" };
  } else if (!lockIntegration.credentialsEncrypted) {
    digitalLock = { connected: false, providerName: lockProviderDisplayName(lockIntegration.provider), reason: "API-nyckel saknas" };
  } else if (lockIntegration.status === "pending") {
    digitalLock = { connected: false, providerName: lockProviderDisplayName(lockIntegration.provider), reason: "Anslutningen är inte verifierad" };
  } else if (lockIntegration.status === "error") {
    digitalLock = { connected: false, providerName: lockProviderDisplayName(lockIntegration.provider), reason: "Anslutningen har ett fel — kontrollera integrationen" };
  } else if (lockIntegration.status === "disconnected") {
    digitalLock = { connected: false, providerName: lockProviderDisplayName(lockIntegration.provider), reason: "Integrationen är frånkopplad" };
  } else if (lockIntegration.status === "active") {
    if (lockIntegration.lastTestedAt) {
      const hoursSinceTest = (Date.now() - lockIntegration.lastTestedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceTest > 24) {
        digitalLock = { connected: false, providerName: lockProviderDisplayName(lockIntegration.provider), reason: "Senaste test för länge sedan — kontrollera anslutningen" };
      } else {
        digitalLock = { connected: true, providerName: lockProviderDisplayName(lockIntegration.provider), reason: null };
      }
    } else {
      digitalLock = { connected: true, providerName: lockProviderDisplayName(lockIntegration.provider), reason: null };
    }
  } else {
    digitalLock = { connected: false, providerName: lockProviderDisplayName(lockIntegration.provider), reason: "Okänd status" };
  }

  return {
    pms,
    digitalLock,
    allMet: pms.connected && digitalLock.connected,
  };
}

// ── toggleCheckin ────────────────────────────────────────────
// Single toggle controls both check-in and check-out as one feature.

export async function toggleCheckin(
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // When enabling, verify prerequisites are met
  if (enabled) {
    const status = await getCheckInPrerequisiteStatus();
    if (!status.allMet) {
      return { ok: false, error: "Alla systemkrav är inte uppfyllda" };
    }
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: {
        checkinEnabled: enabled,
        checkoutEnabled: enabled,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("[toggleCheckin] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera — försök igen" };
  }
}

// ── toggleEarlyCheckin ──────────────────────────────────────

export async function toggleEarlyCheckin(
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  try {
    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: { earlyCheckinEnabled: enabled },
    });
    return { ok: true };
  } catch (error) {
    console.error("[toggleEarlyCheckin] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera — försök igen" };
  }
}

// ── updateEarlyCheckinDays ──────────────────────────────────

// ── getCheckinCardsConfig ────────────────────────────────────

export async function getCheckinCardsConfig(): Promise<CheckinCardConfig | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const config = await getTenantConfig(tenantData.tenant.id, { preferDraft: true });
  return getCheckinCardConfig(config);
}

// ── updateEarlyCheckinDays ──────────────────────────────────

const VALID_EARLY_CHECKIN_DAYS = [0, 1, 2, 3, 5, 7];

export async function updateEarlyCheckinDays(
  days: number,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!VALID_EARLY_CHECKIN_DAYS.includes(days)) {
    return { ok: false, error: "Ogiltigt antal dagar" };
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  try {
    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: { earlyCheckinDays: days },
    });
    return { ok: true };
  } catch (error) {
    console.error("[updateEarlyCheckinDays] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera — försök igen" };
  }
}
