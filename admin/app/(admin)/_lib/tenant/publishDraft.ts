"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentTenant } from "./getCurrentTenant";
import { revalidatePath } from "next/cache";
import { scanTranslatableStrings } from "@/app/_lib/translations/scanner";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

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

    // Atomic transaction: config publish + translation publish together
    // If either fails, both roll back.
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Publish config with optimistic lock
        const updated = await tx.tenant.updateMany({
          where: {
            id: tenant.id,
            settingsVersion: currentVersion,
          },
          data: {
            previousSettings: tenant.settings ?? Prisma.DbNull,
            settings: tenant.draftSettings as Prisma.InputJsonValue,
            draftSettings: Prisma.DbNull,
            draftUpdatedAt: null,
            draftUpdatedBy: null,
            settingsVersion: currentVersion + 1,
          },
        });

        if (updated.count === 0) {
          throw new Error("CONCURRENT_PUBLISH");
        }

        // 2. Delete translations marked for deletion (draftValue = "")
        await tx.tenantTranslation.deleteMany({
          where: { tenantId: tenant.id, draftValue: "" },
        });

        // 3. Copy draftValue → value for remaining drafts (field-to-field requires raw SQL)
        await tx.$executeRaw`
          UPDATE "TenantTranslation"
          SET "value" = "draftValue",
              "sourceDigest" = "draftSourceDigest",
              "draftValue" = NULL,
              "draftSourceDigest" = NULL
          WHERE "tenantId" = ${tenant.id}
            AND "draftValue" IS NOT NULL
            AND "draftValue" != ''
        `;
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === "CONCURRENT_PUBLISH") {
        return {
          success: false,
          error: "Concurrent publish detected — another admin published first. Please refresh and try again.",
        };
      }
      throw txError;
    }

    revalidatePath("/(guest)", "layout");

    // Run translation orphan cleanup (non-critical, outside transaction)
    try {
      const publishedConfig = tenant.draftSettings as TenantConfig | null;
      if (publishedConfig) {
        const publishedLocales = await prisma.tenantLocale.findMany({
          where: { tenantId: tenant.id, published: true },
          select: { locale: true },
        });
        for (const { locale } of publishedLocales) {
          await runOrphanCleanup(tenant.id, locale, publishedConfig);
        }
      }
    } catch (cleanupError) {
      console.error("[publishDraft] Translation cleanup failed:", cleanupError);
    }

    return { success: true };
  } catch (error) {
    console.error("publishDraft error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Remove orphaned translations whose resourceId no longer exists in config.
 */
async function runOrphanCleanup(tenantId: string, locale: string, config: TenantConfig): Promise<void> {
  const fields = scanTranslatableStrings(config, new Map(), locale);
  const currentResourceIds = new Set<string>(fields.map((f) => f.resourceId));

  const storedRows = await prisma.tenantTranslation.findMany({
    where: { tenantId, locale },
    select: { id: true, resourceId: true },
  });

  const orphanIds = storedRows
    .filter((row) => !currentResourceIds.has(row.resourceId))
    .map((row) => row.id);

  if (orphanIds.length > 0) {
    const result = await prisma.tenantTranslation.deleteMany({
      where: { id: { in: orphanIds } },
    });
    console.log(`[publishDraft] Cleaned ${result.count} orphan translations for locale=${locale}`);
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

    // Discard draft translations: delete rows with no published value, clear drafts on rest
    await prisma.tenantTranslation.deleteMany({
      where: { tenantId: tenantData.tenant.id, value: "", draftValue: { not: null } },
    });
    await prisma.tenantTranslation.updateMany({
      where: { tenantId: tenantData.tenant.id, draftValue: { not: null } },
      data: { draftValue: null, draftSourceDigest: null },
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
