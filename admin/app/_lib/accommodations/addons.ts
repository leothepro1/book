/**
 * Accommodation Addon Resolution
 * ═══════════════════════════════
 *
 * Resolves addon products available for an accommodation booking.
 * The ONLY place that queries addon availability and validates addon selections.
 *
 * Flow: AccommodationCategory → AccommodationCategoryAddon → ProductCollection → Product
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

export type AddonProduct = {
  collectionId: string;
  collectionTitle: string;
  collectionSortOrder: number;
  productId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  price: number; // ören
  currency: string;
  hasVariants: boolean;
  variants: AddonVariant[];
  options: AddonOption[];
};

export type AddonVariant = {
  variantId: string;
  title: string;
  price: number; // ören — effective price
  sku: string | null;
  available: boolean;
  sortOrder: number;
};

export type AddonOption = {
  name: string;
  values: string[];
  position: number;
};

export type AddonSelection = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type ResolvedAddonLineItem = {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  currency: string;
  requiresInventoryReservation: boolean;
};

export class AddonValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PRODUCT_NOT_FOUND"
      | "PRODUCT_NOT_ACTIVE"
      | "VARIANT_REQUIRED"
      | "VARIANT_NOT_FOUND"
      | "VARIANT_UNAVAILABLE"
      | "QUANTITY_INVALID"
      | "NOT_AVAILABLE_FOR_ACCOMMODATION",
  ) {
    super(message);
    this.name = "AddonValidationError";
  }
}

// ── Discovery ──────────────────────────────────────────────────

/**
 * resolveAddonsForAccommodation — returns all available addon products.
 *
 * Looks up the accommodation's categories → linked ProductCollections → ACTIVE products.
 * Called from the addons API and from resolveAddonLineItems for validation.
 */
export async function resolveAddonsForAccommodation(
  accommodationId: string,
  tenantId: string,
): Promise<AddonProduct[]> {
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: accommodationId, tenantId, archivedAt: null },
    select: {
      categoryItems: { select: { categoryId: true } },
    },
  });

  if (!accommodation || accommodation.categoryItems.length === 0) {
    return [];
  }

  const categoryIds = accommodation.categoryItems.map((i) => i.categoryId);

  const addonLinks = await prisma.accommodationCategoryAddon.findMany({
    where: { categoryId: { in: categoryIds } },
    orderBy: [{ sortOrder: "asc" }],
    select: {
      collectionId: true,
      sortOrder: true,
      collection: {
        select: {
          id: true,
          title: true,
          status: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              product: {
                select: {
                  id: true,
                  tenantId: true,
                  title: true,
                  description: true,
                  status: true,
                  price: true,
                  currency: true,
                  media: {
                    select: { url: true },
                    orderBy: { sortOrder: "asc" },
                    take: 1,
                  },
                  variants: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      option1: true,
                      option2: true,
                      option3: true,
                      price: true,
                      sku: true,
                      trackInventory: true,
                      inventoryQuantity: true,
                      continueSellingWhenOutOfStock: true,
                      sortOrder: true,
                    },
                  },
                  options: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      name: true,
                      values: true,
                      sortOrder: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  const result: AddonProduct[] = [];

  for (const link of addonLinks) {
    const collection = link.collection;
    if (collection.status !== "ACTIVE") continue;

    for (const item of collection.items) {
      const p = item.product;
      if (p.status !== "ACTIVE") continue;
      if (p.tenantId !== tenantId) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);

      const hasVariants = p.variants.length > 0;

      const variants: AddonVariant[] = p.variants.map((v) => {
        const effectivePrice = v.price > 0 ? v.price : p.price;
        const available =
          !v.trackInventory ||
          v.continueSellingWhenOutOfStock ||
          v.inventoryQuantity > 0;

        const title = [v.option1, v.option2, v.option3]
          .filter(Boolean)
          .join(" / ") || "Standard";

        return {
          variantId: v.id,
          title,
          price: effectivePrice,
          sku: v.sku,
          available,
          sortOrder: v.sortOrder,
        };
      });

      const options: AddonOption[] = p.options.map((o) => ({
        name: o.name,
        values: Array.isArray(o.values) ? (o.values as string[]) : [],
        position: o.sortOrder,
      }));

      result.push({
        collectionId: collection.id,
        collectionTitle: collection.title,
        collectionSortOrder: link.sortOrder,
        productId: p.id,
        title: p.title,
        description: p.description,
        imageUrl: p.media[0]?.url ?? null,
        price: p.price,
        currency: p.currency,
        hasVariants,
        variants,
        options,
      });
    }
  }

  return result;
}

// ── Checkout validation ────────────────────────────────────────

/**
 * resolveAddonLineItems — validates selections and returns snapshotted line items.
 *
 * Called from payment-intent route ONLY.
 * Throws AddonValidationError for all known failures.
 */
export async function resolveAddonLineItems(
  tenantId: string,
  accommodationId: string,
  selections: AddonSelection[],
): Promise<ResolvedAddonLineItem[]> {
  if (!selections || selections.length === 0) return [];

  for (const sel of selections) {
    if (!Number.isInteger(sel.quantity) || sel.quantity < 1 || sel.quantity > 99) {
      throw new AddonValidationError(
        `Invalid quantity ${sel.quantity} for product ${sel.productId}`,
        "QUANTITY_INVALID",
      );
    }
  }

  const available = await resolveAddonsForAccommodation(accommodationId, tenantId);
  const availableById = new Map(available.map((a) => [a.productId, a]));

  const resolved: ResolvedAddonLineItem[] = [];

  for (const sel of selections) {
    const addon = availableById.get(sel.productId);
    if (!addon) {
      throw new AddonValidationError(
        `Product ${sel.productId} is not available as an addon for accommodation ${accommodationId}`,
        "NOT_AVAILABLE_FOR_ACCOMMODATION",
      );
    }

    let unitAmount: number;
    let variantTitle: string | null = null;
    let sku: string | null = null;
    let requiresInventoryReservation = false;

    if (addon.hasVariants) {
      if (!sel.variantId) {
        throw new AddonValidationError(
          `Product ${sel.productId} has variants — variantId is required`,
          "VARIANT_REQUIRED",
        );
      }

      const variant = addon.variants.find((v) => v.variantId === sel.variantId);
      if (!variant) {
        throw new AddonValidationError(
          `Variant ${sel.variantId} not found on product ${sel.productId}`,
          "VARIANT_NOT_FOUND",
        );
      }

      if (!variant.available) {
        throw new AddonValidationError(
          `Variant ${sel.variantId} is out of stock`,
          "VARIANT_UNAVAILABLE",
        );
      }

      unitAmount = variant.price;
      variantTitle = variant.title;
      sku = variant.sku;

      // Check inventory tracking on the actual variant record
      const variantRecord = await prisma.productVariant.findFirst({
        where: { id: sel.variantId, product: { tenantId } },
        select: { trackInventory: true },
      });
      requiresInventoryReservation = variantRecord?.trackInventory ?? false;
    } else {
      unitAmount = addon.price;
    }

    resolved.push({
      productId: sel.productId,
      variantId: sel.variantId,
      title: addon.title,
      variantTitle,
      sku,
      imageUrl: addon.imageUrl,
      quantity: sel.quantity,
      unitAmount,
      totalAmount: unitAmount * sel.quantity,
      currency: addon.currency,
      requiresInventoryReservation,
    });
  }

  return resolved;
}
