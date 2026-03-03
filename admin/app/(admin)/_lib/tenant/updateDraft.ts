"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "./getCurrentTenant";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import merge from "deepmerge";

/**
 * Uppdaterar draft settings med deep merge.
 * Alla nested objects (theme.colors, theme.buttons, etc.) mergas korrekt.
 * 
 * Arrayfält (home.links, footer.items, rules) ersätts helt (inte concatat).
 */
const overwriteArrays: merge.Options["arrayMerge"] = (_target, source) => source;

export async function updateDraft(
  changes: Partial<TenantConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    const tenantData = await getCurrentTenant();

    if (!userId || !tenantData) {
      return { success: false, error: "Unauthorized" };
    }

    const { tenant } = tenantData;

    // Base: current draft → live settings → empty object
    const baseConfig = (tenant.draftSettings || tenant.settings || {}) as Record<string, unknown>;

    // Deep merge with array overwrite
    const updatedDraft = merge(baseConfig, changes as Record<string, unknown>, {
      arrayMerge: overwriteArrays,
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        draftSettings: updatedDraft as any,
        draftUpdatedAt: new Date(),
        draftUpdatedBy: userId,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("updateDraft error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
