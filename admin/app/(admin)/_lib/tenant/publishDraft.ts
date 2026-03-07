"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentTenant } from "./getCurrentTenant";
import { revalidatePath } from "next/cache";

export async function publishDraft(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) return { success: false, error: "Unauthorized" };

    const { tenant } = tenantData;
    if (!tenant.draftSettings) return { success: false, error: "No draft to publish" };

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        settings: tenant.draftSettings,
        draftSettings: Prisma.DbNull,
        draftUpdatedAt: null as any,
        draftUpdatedBy: null as any,
      },
    });

    revalidatePath("/(guest)", "layout");
    return { success: true };
  } catch (error) {
    console.error("publishDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function discardDraft(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) return { success: false, error: "Unauthorized" };

    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: {
        draftSettings: Prisma.DbNull,
        draftUpdatedAt: null as any,
        draftUpdatedBy: null as any,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("discardDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
