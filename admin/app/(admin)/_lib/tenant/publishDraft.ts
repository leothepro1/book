"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentTenant } from "./getCurrentTenant";
import { revalidatePath } from "next/cache";

/**
 * Publish draft settings to live.
 *
 * Uses optimistic locking (settingsVersion) to prevent concurrent publishes
 * from silently overwriting each other. Snapshots previous live settings
 * to enable one-click rollback.
 *
 * Transaction ensures atomicity: either all fields update or none do.
 */
export async function publishDraft(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) return { success: false, error: "Unauthorized" };

    const { tenant } = tenantData;
    if (!tenant.draftSettings) return { success: false, error: "No draft to publish" };

    const currentVersion = tenant.settingsVersion;

    // Transaction: snapshot previous → copy draft to live → clear draft → bump version
    const updated = await prisma.tenant.updateMany({
      where: {
        id: tenant.id,
        settingsVersion: currentVersion, // Optimistic lock check
      },
      data: {
        previousSettings: tenant.settings ?? Prisma.DbNull,
        settings: tenant.draftSettings,
        draftSettings: Prisma.DbNull,
        draftUpdatedAt: null,
        draftUpdatedBy: null,
        settingsVersion: currentVersion + 1,
      },
    });

    if (updated.count === 0) {
      return {
        success: false,
        error: "Concurrent publish detected — another admin published first. Please refresh and try again.",
      };
    }

    revalidatePath("/(guest)", "layout");
    return { success: true };
  } catch (error) {
    console.error("publishDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Discard all draft changes without publishing.
 * Live settings remain unchanged.
 */
export async function discardDraft(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) return { success: false, error: "Unauthorized" };

    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: {
        draftSettings: Prisma.DbNull,
        draftUpdatedAt: null,
        draftUpdatedBy: null,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("discardDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Rollback to previous published settings.
 *
 * Swaps live settings with previousSettings snapshot.
 * Only available if a previous snapshot exists (at least one publish has occurred).
 */
export async function rollbackSettings(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) return { success: false, error: "Unauthorized" };

    const { tenant } = tenantData;
    if (!tenant.previousSettings) {
      return { success: false, error: "No previous version to rollback to" };
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        // Swap: previous becomes live, current becomes previous
        settings: tenant.previousSettings,
        previousSettings: tenant.settings ?? Prisma.DbNull,
        draftSettings: Prisma.DbNull,
        draftUpdatedAt: null,
        draftUpdatedBy: null,
        settingsVersion: { increment: 1 },
      },
    });

    revalidatePath("/(guest)", "layout");
    return { success: true };
  } catch (error) {
    console.error("rollbackSettings error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
