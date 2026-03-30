/**
 * Product Resolution
 * ══════════════════
 *
 * Converts raw Prisma Product to a ResolvedProduct.
 * Pure function — no server action, no DB calls.
 * displayTitle = title (accommodation display is handled by resolveAccommodation())
 */

import type { ResolvedProduct } from "./types";

/**
 * Convert a raw Prisma Product to a ResolvedProduct.
 */
export function resolveProduct(product: {
  id: string;
  tenantId: string;
  productType: string;
  slug: string;
  status: string;
  title: string;
  description: string;
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
  return {
    id: product.id,
    tenantId: product.tenantId,
    productType: product.productType,
    slug: product.slug,
    status: product.status as ResolvedProduct["status"],
    displayTitle: product.title,
    displayDescription: product.description,
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
