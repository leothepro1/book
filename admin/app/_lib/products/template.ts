/**
 * Product Template Resolution
 * ═══════════════════════════
 *
 * Single source of truth for resolving which ProductTemplate
 * applies to a given product. No other file should perform
 * inline template lookups.
 *
 * Resolution order:
 *   1. Product has templateId → fetch that specific template
 *   2. No templateId → fetch tenant's default template (isDefault = true)
 *   3. No default exists → return null (caller uses FALLBACK_SECTIONS)
 *
 * Template sections live in TenantConfig.pages["shop-product.{suffix}"],
 * NOT in the ProductTemplate model. This function resolves the metadata
 * and builds the correct pageId for config lookup.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { PageId } from "@/app/_lib/pages/types";
import type { ResolvedProduct } from "./types";

export type ProductTemplateResult = {
  id: string;
  suffix: string;
  name: string;
  isDefault: boolean;
  /** The PageId to use as templateKey for ThemeRenderer. */
  pageId: PageId;
};

/**
 * Build the PageId for a template suffix.
 * "default" → "shop-product", anything else → "shop-product.{suffix}"
 */
export function templateSuffixToPageId(suffix: string): PageId {
  return suffix === "default" ? "shop-product" : `shop-product.${suffix}`;
}

/**
 * Resolve the ProductTemplate for a given product.
 *
 * @param tenantId - The tenant ID (used to verify ownership)
 * @param product  - A ResolvedProduct (must have templateId if assigned)
 * @returns Template metadata + pageId, or null if no template exists
 */
export async function resolveProductTemplate(
  tenantId: string,
  product: ResolvedProduct & { templateId?: string | null },
): Promise<ProductTemplateResult | null> {
  // 1. Product has an explicit template assignment
  if (product.templateId) {
    const template = await prisma.productTemplate.findFirst({
      where: { id: product.templateId, tenantId },
      select: { id: true, suffix: true, name: true, isDefault: true },
    });
    if (template) {
      return { ...template, pageId: templateSuffixToPageId(template.suffix) };
    }
  }

  // 2. Fall back to the tenant's default template
  const defaultTemplate = await prisma.productTemplate.findFirst({
    where: { tenantId, isDefault: true },
    select: { id: true, suffix: true, name: true, isDefault: true },
  });
  if (defaultTemplate) {
    return { ...defaultTemplate, pageId: templateSuffixToPageId(defaultTemplate.suffix) };
  }

  // 3. No template exists — caller must handle gracefully
  return null;
}
