"use server";

/**
 * ProductTemplate CRUD Actions
 * ════════════════════════════
 *
 * Admin-scoped actions for managing product page templates.
 * Template sections live in TenantConfig.pages["shop-product.{suffix}"].
 * These actions manage the metadata (name, suffix, isDefault) and
 * seed/clean up the corresponding TenantConfig entries via updateDraft.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { updateDraft } from "@/app/(admin)/_lib/tenant/updateDraft";
import { getPageSections, buildSectionsPatch } from "@/app/_lib/pages/config";
import { templateSuffixToPageId } from "./template";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { SectionInstance } from "@/app/_lib/sections/types";

// ── Validation ──────────────────────────────────────────────

const SUFFIX_PATTERN = /^[a-z0-9-]+$/;

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Create ──────────────────────────────────────────────────

export async function createProductTemplate(input: {
  name: string;
  suffix: string;
  isDefault: boolean;
}): Promise<ActionResult<{ id: string; suffix: string }>> {
  await requireAdmin();
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Unauthorized" };
  const tenantId = tenantData.tenant.id;

  // Validate name
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    return { ok: false, error: "Mallnamn får inte vara tomt." };
  }
  if (trimmedName.length > 100) {
    return { ok: false, error: "Mallnamn får inte vara längre än 100 tecken." };
  }

  // Validate suffix
  const suffix = input.suffix.trim().toLowerCase();
  if (suffix === "default") {
    return { ok: false, error: "Suffixet \"default\" är reserverat. Välj ett annat." };
  }
  if (suffix.length > 40) {
    return { ok: false, error: "Suffix får inte vara längre än 40 tecken." };
  }
  if (!SUFFIX_PATTERN.test(suffix)) {
    return { ok: false, error: "Suffix får bara innehålla gemener, siffror och bindestreck." };
  }

  try {
    const template = await prisma.$transaction(async (tx) => {
      // If isDefault: unset other defaults first
      if (input.isDefault) {
        await tx.productTemplate.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.productTemplate.create({
        data: {
          tenantId,
          name: trimmedName,
          suffix,
          isDefault: input.isDefault,
        },
      });
    });

    // Seed initial sections by copying from "shop-product" (the base template)
    const config = (tenantData.tenant.draftSettings ?? tenantData.tenant.settings ?? {}) as TenantConfig;
    const baseSections = getPageSections(config, "shop-product");
    const newPageId = templateSuffixToPageId(suffix);
    const sections = baseSections.length > 0 ? baseSections : ([] as SectionInstance[]);
    const patch = buildSectionsPatch(config, newPageId, sections);

    await updateDraft(patch as any);

    return { ok: true, data: { id: template.id, suffix: template.suffix } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: `En mall med suffix "${suffix}" finns redan.` };
    }
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────

export async function updateProductTemplate(
  id: string,
  input: { name?: string; isDefault?: boolean },
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Unauthorized" };
  const tenantId = tenantData.tenant.id;

  // Verify ownership
  const existing = await prisma.productTemplate.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return { ok: false, error: "Mallen hittades inte." };

  await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.productTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    await tx.productTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });
  });

  return { ok: true, data: { id } };
}

// ── Delete ──────────────────────────────────────────────────

export async function deleteProductTemplate(
  id: string,
): Promise<ActionResult> {
  await requireAdmin();
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Unauthorized" };
  const tenantId = tenantData.tenant.id;

  const existing = await prisma.productTemplate.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return { ok: false, error: "Mallen hittades inte." };

  if (existing.isDefault) {
    return { ok: false, error: "Standardmallen kan inte tas bort. Välj en annan som standard först." };
  }

  // Delete template (Product.templateId → null via onDelete: SetNull)
  await prisma.productTemplate.delete({ where: { id, tenantId } });

  // Clean up TenantConfig entry — direct write (not deepmerge).
  // deepmerge would re-add the key from baseConfig, so we read the full
  // config, remove the key, and write the result directly to draftSettings.
  // Same pattern as publishDraft which writes settings wholesale.
  const pageId = templateSuffixToPageId(existing.suffix);
  const fullConfig = structuredClone(
    (tenantData.tenant.draftSettings ?? tenantData.tenant.settings ?? {}) as Record<string, unknown>,
  );
  const pages = (fullConfig.pages ?? {}) as Record<string, unknown>;
  delete pages[pageId];
  fullConfig.pages = pages;

  const { getAuth } = await import("@/app/(admin)/_lib/auth/devAuth");
  const { userId } = await getAuth();

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      draftSettings: fullConfig as any,
      draftUpdatedAt: new Date(),
      draftUpdatedBy: userId ?? "dev_user",
    },
  });

  return { ok: true, data: undefined };
}

// ── List ────────────────────────────────────────────────────

export async function listProductTemplates(): Promise<
  Array<{ id: string; name: string; suffix: string; isDefault: boolean; createdAt: Date }>
> {
  await requireAdmin();
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  return prisma.productTemplate.findMany({
    where: { tenantId: tenantData.tenant.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, suffix: true, isDefault: true, createdAt: true },
  });
}
