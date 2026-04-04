"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "./getCurrentTenant";
import { getAuth } from "../auth/devAuth";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import merge from "deepmerge";

/** Deeply partial TenantConfig — matches deepmerge's actual merge semantics. */
export type DraftPatch = {
  [K in keyof TenantConfig]?: TenantConfig[K] extends (infer U)[]
    ? U[]
    : TenantConfig[K] extends Record<string, unknown>
      ? Partial<TenantConfig[K]>
      : TenantConfig[K];
};

const overwriteArrays: merge.Options["arrayMerge"] = (_target, source) => source;

export async function updateDraft(
  changes: DraftPatch
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[updateDraft] called with keys:", Object.keys(changes));
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

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        draftSettings: updatedDraft as unknown as InputJsonValue,
        draftUpdatedAt: new Date(),
        draftUpdatedBy: effectiveUserId,
      },
    });
    return { success: true };
  } catch (error) {
    console.error("updateDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
