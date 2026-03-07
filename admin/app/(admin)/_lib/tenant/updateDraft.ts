"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "./getCurrentTenant";
import { getAuth } from "../auth/devAuth";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import merge from "deepmerge";

const overwriteArrays: merge.Options["arrayMerge"] = (_target, source) => source;

export async function updateDraft(
  changes: Partial<TenantConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();

    if (!tenantData) {
      return { success: false, error: "Unauthorized" };
    }

    const { tenant } = tenantData;
    const effectiveUserId = userId ?? "dev_user";

    const baseConfig = (tenant.draftSettings || tenant.settings || {}) as Record<string, unknown>;
    const updatedDraft = merge(baseConfig, changes as Record<string, unknown>, {
      arrayMerge: overwriteArrays,
    });

    // DEBUG: log card count before/after merge
    const beforeCards = (baseConfig as any)?.home?.cards?.length ?? 0;
    const afterCards = (updatedDraft as any)?.home?.cards?.length ?? 0;
    const changesCards = (changes as any)?.home?.cards?.length ?? 0;
    console.log(`[updateDraft] cards: base=${beforeCards}, changes=${changesCards}, merged=${afterCards}`);

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        draftSettings: updatedDraft as any,
        draftUpdatedAt: new Date(),
        draftUpdatedBy: effectiveUserId,
      },
    });

    console.log(`[updateDraft] SUCCESS — saved ${afterCards} cards to DB`);
    return { success: true };
  } catch (error) {
    console.error("updateDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
