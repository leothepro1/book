/**
 * Product Resolution
 * ══════════════════
 *
 * Converts raw Prisma Product to a ResolvedProduct.
 * This is the ONLY function that reads pmsData for display.
 * Pure function — no server action, no DB calls.
 */

import type { ResolvedProduct } from "./types";

/**
 * Convert a raw Prisma Product to a ResolvedProduct.
 * For PMS_ACCOMMODATION: displayTitle = titleOverride ?? pmsData.name ?? title
 * For STANDARD: displayTitle = title
 */
export function resolveProduct(product: {
  id: string;
  tenantId: string;
  productType: string;
  slug: string;
  status: string;
  title: string;
  description: string;
  pmsSourceId: string | null;
  pmsProvider: string | null;
  pmsSyncedAt: Date | null;
  pmsData: unknown;
  titleOverride: string | null;
  descriptionOverride: string | null;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  taxable: boolean;
  trackInventory: boolean;
  inventoryQuantity: number;
  continueSellingWhenOutOfStock: boolean;
  version: number;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ResolvedProduct {
  const pmsRaw = product.pmsData as Record<string, unknown> | null;

  return {
    id: product.id,
    tenantId: product.tenantId,
    productType: product.productType,
    slug: product.slug,
    status: product.status as ResolvedProduct["status"],
    displayTitle:
      product.titleOverride ??
      (pmsRaw?.name as string | undefined) ??
      product.title,
    displayDescription:
      product.descriptionOverride ??
      (pmsRaw?.longDescription as string | undefined) ??
      (pmsRaw?.shortDescription as string | undefined) ??
      product.description,
    pmsSourceId: product.pmsSourceId,
    pmsProvider: product.pmsProvider,
    pmsSyncedAt: product.pmsSyncedAt,
    price: product.price,
    currency: product.currency,
    compareAtPrice: product.compareAtPrice,
    taxable: product.taxable,
    trackInventory: product.trackInventory,
    inventoryQuantity: product.inventoryQuantity,
    continueSellingWhenOutOfStock: product.continueSellingWhenOutOfStock,
    version: product.version,
    sortOrder: product.sortOrder,
    archivedAt: product.archivedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
