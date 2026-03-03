"use server";

import { prisma } from "@/app/_lib/db/prisma";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { getCurrentTenant } from "./getCurrentTenant";

/**
 * Hämtar draft config om den finns, annars live settings.
 * Används av preview för att visa uncommitted changes.
 */
export async function getDraftConfig(): Promise<TenantConfig | null> {
  const tenantData = await getCurrentTenant();
  
  if (!tenantData) {
    return null;
  }

  const { tenant } = tenantData;

  // Prioritera draft om den finns
  if (tenant.draftSettings && typeof tenant.draftSettings === 'object') {
    return {
      tenantId: tenant.id,
      ...(tenant.draftSettings as any),
    };
  }

  // Fallback till live settings
  if (tenant.settings && typeof tenant.settings === 'object') {
    return {
      tenantId: tenant.id,
      ...(tenant.settings as any),
    };
  }

  return null;
}

/**
 * Hämtar live config (ignorerar draft).
 * Används för "compare with live" funktionalitet.
 */
export async function getLiveConfig(): Promise<TenantConfig | null> {
  const tenantData = await getCurrentTenant();
  
  if (!tenantData?.tenant.settings) {
    return null;
  }

  return {
    tenantId: tenantData.tenant.id,
    ...(tenantData.tenant.settings as any),
  };
}

/**
 * Kollar om tenant har uncommitted draft.
 */
export async function hasDraft(): Promise<boolean> {
  const tenantData = await getCurrentTenant();
  return !!tenantData?.tenant.draftSettings;
}
