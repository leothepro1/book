"use server";

/**
 * updateMenusLive — Writes menus to BOTH draft and live settings.
 *
 * Menus are content, not design. Changes should be immediately visible
 * on the guest portal without requiring a publish through /editor.
 *
 * Uses optimistic locking (settingsVersion) to prevent concurrent writes
 * from silently overwriting each other — same pattern as publishDraft.
 *
 * Cascade cleanup: when menus are deleted, all references in header
 * (headerMenuId) and footer (classicGroups element menu_id) are cleared.
 *
 * Pipeline:
 *   1. Read current settings with settingsVersion
 *   2. Compute removed menu IDs → cascade cleanup references
 *   3. Merge menus into both live and draft
 *   4. Atomic write with version check (optimistic lock)
 *   5. Revalidate guest portal cache
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "./getCurrentTenant";
import { getAuth } from "../auth/devAuth";
import { revalidatePath } from "next/cache";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import type { MenuConfig } from "@/app/(guest)/_lib/tenant/types";

// ─── Cascade cleanup ─────────────────────────────────────────

/**
 * Remove dangling menu references from config when menus are deleted.
 * Pure function — takes config object, returns cleaned copy.
 */
function cleanupDeletedMenuRefs(
  config: Record<string, unknown>,
  removedIds: Set<string>,
): Record<string, unknown> {
  if (removedIds.size === 0) return config;

  const result = { ...config };

  // Clean header.headerMenuId
  const header = result.globalHeader as Record<string, unknown> | undefined;
  if (header && typeof header.headerMenuId === "string" && removedIds.has(header.headerMenuId)) {
    result.globalHeader = { ...header, headerMenuId: "" };
  }

  // Clean footer classicGroups element menu_id references
  const footer = result.globalFooter as Record<string, unknown> | undefined;
  if (footer?.classicGroups) {
    const groups = footer.classicGroups as { top?: unknown[]; bottom?: unknown[] };
    const cleanGroup = (elements: unknown[] | undefined): unknown[] | undefined => {
      if (!elements) return elements;
      return elements.map((el) => {
        const element = el as Record<string, unknown>;
        if (element.type !== "menu") return element;
        const settings = element.settings as Record<string, unknown> | undefined;
        if (!settings || typeof settings.menu_id !== "string") return element;
        if (!removedIds.has(settings.menu_id)) return element;
        return { ...element, settings: { ...settings, menu_id: "" } };
      });
    };
    result.globalFooter = {
      ...footer,
      classicGroups: {
        top: cleanGroup(groups.top),
        bottom: cleanGroup(groups.bottom),
      },
    };
  }

  return result;
}

// ─── Main ────────────────────────────────────────────────────

export async function updateMenusLive(
  menus: MenuConfig[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();

    if (!tenantData) {
      return { success: false, error: "Unauthorized" };
    }

    const { tenant } = tenantData;
    const effectiveUserId = userId ?? "dev_user";
    const currentVersion = tenant.settingsVersion;

    // Detect removed menus for cascade cleanup
    const liveConfig = (tenant.settings || {}) as Record<string, unknown>;
    const draftConfig = (tenant.draftSettings || tenant.settings || {}) as Record<string, unknown>;
    const previousMenus = (liveConfig.menus ?? []) as { id: string }[];
    const newMenuIds = new Set(menus.map((m) => m.id));
    const removedIds = new Set(
      previousMenus.filter((m) => !newMenuIds.has(m.id)).map((m) => m.id),
    );

    // Apply menus + cascade cleanup
    const updatedLive = cleanupDeletedMenuRefs({ ...liveConfig, menus }, removedIds);
    const updatedDraft = cleanupDeletedMenuRefs({ ...draftConfig, menus }, removedIds);

    // Atomic write with optimistic lock
    const updated = await prisma.tenant.updateMany({
      where: {
        id: tenant.id,
        settingsVersion: currentVersion,
      },
      data: {
        settings: updatedLive as unknown as InputJsonValue,
        draftSettings: updatedDraft as unknown as InputJsonValue,
        settingsVersion: currentVersion + 1,
        draftUpdatedAt: new Date(),
        draftUpdatedBy: effectiveUserId,
      },
    });

    if (updated.count === 0) {
      return {
        success: false,
        error: "Concurrent update detected — another admin saved at the same time. Please refresh and try again.",
      };
    }

    revalidatePath("/(guest)", "layout");

    return { success: true };
  } catch (error) {
    console.error("updateMenusLive error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
