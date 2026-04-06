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
 *
 * options, variants, and media are optional on the input — callers
 * that don't include them in their Prisma query get empty arrays.
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
  templateId?: string | null;
  options?: Array<{ id: string; name: string; values: unknown; sortOrder: number }>;
  variants?: Array<{
    id: string;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    price: number;
    compareAtPrice: number | null;
    imageUrl: string | null;
    sku: string | null;
    trackInventory: boolean;
    inventoryQuantity: number;
    continueSellingWhenOutOfStock: boolean;
  }>;
  media?: Array<{ id: string; url: string; type: string; alt: string }>;
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
    templateId: product.templateId ?? null,
    options: (product.options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      values: o.values as string[],
    })),
    variants: (product.variants ?? []).map((v) => ({
      id: v.id,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      imageUrl: v.imageUrl,
      sku: v.sku,
      trackInventory: v.trackInventory,
      inventoryQuantity: v.inventoryQuantity,
      continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
    })),
    media: (product.media ?? []).map((m) => ({
      id: m.id,
      url: m.url,
      type: m.type,
      alt: m.alt,
    })),
  };
}
