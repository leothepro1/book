"use server";

/**
 * Product Server Actions
 * ══════════════════════
 * CRUD operations for the product catalog — Shopify-grade.
 *
 * Enterprise guarantees:
 *   1. Atomic transactions (product + media + options + variants + collections)
 *   2. Optimistic locking (version field — rejects stale updates with 409)
 *   3. Variant validation (options ↔ variants consistency enforced)
 *   4. Slug collision safety (DB unique constraint as final guard)
 *   5. Soft delete (ARCHIVED status — data preserved, hidden from storefront)
 *   6. Price history (every price change logged to PriceChange ledger)
 *   7. Inventory ledger (initial stock recorded in InventoryChange)
 *   8. Tenant-scoped + admin-gated (every operation)
 */

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import {
  CreateProductSchema,
  UpdateProductSchema,
  CreateCollectionSchema,
  UpdateCollectionSchema,
  titleToSlug,
  validateVariantsAgainstOptions,
  ProductActionError,
} from "./types";
import type {
  CreateProductInput,
  UpdateProductInput,
  CreateCollectionInput,
  UpdateCollectionInput,
} from "./types";
import type { InventoryChangeReason } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ResolvedProduct } from "./types";
import { resolveProduct } from "./resolve";
import { log } from "@/app/_lib/logger";
import { safeParseSeoMetadata } from "@/app/_lib/seo/types";

// ── Result types ─────────────────────────────────────────────

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "VERSION_CONFLICT" };

// ── Slug collision resolution (retry loop + DB constraint) ───

const MAX_SLUG_RETRIES = 10;

async function resolveUniqueSlug(
  tenantId: string,
  baseSlug: string,
  excludeProductId?: string,
): Promise<string> {
  let slug = baseSlug || "product";
  for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const existing = await prisma.product.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!existing || existing.id === excludeProductId) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function resolveUniqueCollectionSlug(
  tenantId: string,
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let slug = baseSlug || "collection";
  for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const existing = await prisma.productCollection.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

// ═════════════════════════════════════════════════════════════
// PRODUCT CRUD
// ═════════════════════════════════════════════════════════════

export async function createProduct(
  input: CreateProductInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const parsed = CreateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valideringsfel" };
  }

  const data = parsed.data;

  // Validate variants match options
  if (data.variants.length > 0) {
    const variantError = validateVariantsAgainstOptions(data.options, data.variants);
    if (variantError) return { ok: false, error: variantError };
  }

  const slug = await resolveUniqueSlug(tenantId, titleToSlug(data.title));

  // ── SEO (optional) — strip `undefined` for Prisma's InputJsonValue.
  //
  // Zod `.partial()` surfaces every missing key as `undefined`;
  // Prisma rejects those inside object JSON values. JSON-stringify +
  // re-parse drops them, and the parse we just ran guarantees the
  // resulting shape satisfies `SeoMetadataSchema.partial()`.
  const seoJson: Prisma.InputJsonValue | null =
    data.seo !== undefined
      ? (JSON.parse(JSON.stringify(data.seo)) as Prisma.InputJsonValue)
      : null;

  try {
    const product = await prisma.$transaction(async (tx) => {
      // 1. Create product
      const product = await tx.product.create({
        data: {
          tenantId,
          title: data.title,
          description: data.description,
          slug,
          status: data.status,
          price: data.price,
          currency: data.currency,
          compareAtPrice: data.compareAtPrice ?? null,
          taxable: data.taxable,
          trackInventory: data.trackInventory,
          inventoryQuantity: data.inventoryQuantity,
          continueSellingWhenOutOfStock: data.continueSellingWhenOutOfStock,
          version: 1,
          ...(seoJson !== null && { seo: seoJson }),
        },
      });

      // Log initial product price
      if (data.price > 0) {
        await tx.priceChange.create({
          data: {
            tenantId, productId: product.id, variantId: null,
            previousPrice: 0, newPrice: data.price,
            currency: data.currency,
            actorUserId: tenantData.clerkUserId,
          },
        });
      }

      // 2. Media
      if (data.media.length > 0) {
        await tx.productMedia.createMany({
          data: data.media.map((m, i) => ({
            productId: product.id,
            url: m.url, type: m.type, alt: m.alt,
            filename: m.filename, width: m.width ?? null, height: m.height ?? null,
            sortOrder: i,
          })),
        });
      }

      // 3. Options
      if (data.options.length > 0) {
        await tx.productOption.createMany({
          data: data.options.map((o, i) => ({
            productId: product.id, name: o.name, values: o.values, sortOrder: i,
          })),
        });
      }

      // 4. Variants
      if (data.variants.length > 0) {
        await tx.productVariant.createMany({
          data: data.variants.map((v, i) => ({
            productId: product.id,
            option1: v.option1 ?? null, option2: v.option2 ?? null, option3: v.option3 ?? null,
            imageUrl: v.imageUrl ?? null, price: v.price, compareAtPrice: v.compareAtPrice ?? null,
            sku: v.sku ?? null, trackInventory: v.trackInventory,
            inventoryQuantity: v.inventoryQuantity,
            continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
            sortOrder: i, version: 1,
          })),
        });

        // Record initial inventory for each variant that tracks stock
        const createdVariants = await tx.productVariant.findMany({
          where: { productId: product.id },
          orderBy: { sortOrder: "asc" },
        });
        for (const v of createdVariants) {
          // Log initial inventory
          if (v.trackInventory && v.inventoryQuantity > 0) {
            await tx.inventoryChange.create({
              data: {
                tenantId, productId: product.id, variantId: v.id,
                quantityDelta: v.inventoryQuantity, quantityAfter: v.inventoryQuantity,
                reason: "INITIAL" as InventoryChangeReason,
                note: "Initialt lager vid skapande",
                actorUserId: tenantData.clerkUserId,
              },
            });
          }
          // Log initial price
          if (v.price > 0) {
            await tx.priceChange.create({
              data: {
                tenantId, productId: product.id, variantId: v.id,
                previousPrice: 0, newPrice: v.price,
                currency: data.currency,
                actorUserId: tenantData.clerkUserId,
              },
            });
          }
        }
      }

      // Record initial inventory at product level
      if (data.variants.length === 0 && data.trackInventory && data.inventoryQuantity > 0) {
        await tx.inventoryChange.create({
          data: {
            tenantId, productId: product.id, variantId: null,
            quantityDelta: data.inventoryQuantity, quantityAfter: data.inventoryQuantity,
            reason: "INITIAL" as InventoryChangeReason,
            note: "Initialt lager vid skapande",
            actorUserId: tenantData.clerkUserId,
          },
        });
      }

      // 5. Collections
      if (data.collectionIds.length > 0) {
        const collections = await tx.productCollection.findMany({
          where: { id: { in: data.collectionIds }, tenantId },
          select: { id: true },
        });
        const validIds = new Set(collections.map((c) => c.id));
        const memberships = data.collectionIds
          .filter((id) => validIds.has(id))
          .map((collectionId) => ({ collectionId, productId: product.id, sortOrder: 0 }));
        if (memberships.length > 0) {
          await tx.productCollectionItem.createMany({ data: memberships });
        }
      }

      // 6. Tags — upsert global tags + associate
      if (data.tags.length > 0) {
        for (const rawTag of data.tags) {
          const name = rawTag.trim().toLowerCase();
          if (!name) continue;
          const tag = await tx.productTag.upsert({
            where: { tenantId_name: { tenantId, name } },
            create: { tenantId, name },
            update: {},
          });
          await tx.productTagItem.create({
            data: { productId: product.id, tagId: tag.id },
          }).catch(() => {}); // Ignore duplicate
        }
      }

      return product;
    });

    if (data.seo !== undefined) {
      log("info", "seo.entity.seo_created", {
        tenantId,
        resourceType: "product",
        entityId: product.id,
        fieldsChanged: Object.keys(data.seo).join(","),
      });
    }

    revalidatePath("/(guest)", "layout");
    return { ok: true, data: { id: product.id, slug: product.slug } };
  } catch (error) {
    // Handle slug collision at DB level (race condition safety net)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "En produkt med denna URL finns redan. Prova ett annat namn." };
    }
    throw error;
  }
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
): Promise<ActionResult<{ id: string; slug: string; version: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const parsed = UpdateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valideringsfel" };
  }

  const data = parsed.data;

  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: {
      id: true, slug: true, title: true, version: true, price: true, currency: true,
      productType: true,
      seo: true,
      options: { orderBy: { sortOrder: "asc" }, select: { name: true, values: true } },
    },
  });
  if (!existing) return { ok: false, error: "Produkten hittades inte" };

  // ── SEO: parse + shallow-merge at the boundary ──
  //
  // Overrides from the form win over stored entity.seo; fields the
  // UI doesn't edit yet (noindex, ogImageId, ogImageAlt, etc.) carry
  // through unchanged. Mirrors the Batch 2 accommodations merge —
  // `SeoMetadataSchema.partial()` inside UpdateProductSchema already
  // validated the inbound shape, so we only need to strip
  // `undefined` for Prisma's InputJsonValue.
  let mergedSeoJson: Prisma.InputJsonValue | undefined;
  if (data.seo !== undefined) {
    const existingSeo = safeParseSeoMetadata(existing.seo) ?? {};
    const merged = { ...existingSeo, ...data.seo };
    mergedSeoJson = JSON.parse(JSON.stringify(merged)) as Prisma.InputJsonValue;
  }

  // Validate variants against options (use provided options, or fall back to existing)
  if (data.variants && data.variants.length > 0) {
    const effectiveOptions = data.options ?? (existing.options.map((o) => ({
      name: o.name,
      values: Array.isArray(o.values) ? o.values as string[] : [],
    })));
    const variantError = validateVariantsAgainstOptions(effectiveOptions, data.variants);
    if (variantError) return { ok: false, error: variantError };
  }

  // Validate compareAtPrice against effective price (provided or existing)
  if (data.compareAtPrice != null && data.compareAtPrice > 0) {
    const effectivePrice = data.price ?? existing.price;
    if (data.compareAtPrice <= effectivePrice) {
      return { ok: false, error: "Jämförpris måste vara högre än priset" };
    }
  }

  // Optimistic locking check
  if (data.expectedVersion !== undefined && data.expectedVersion !== existing.version) {
    return { ok: false, error: "Produkten har ändrats av någon annan. Ladda om och försök igen.", code: "VERSION_CONFLICT" };
  }

  let slug = existing.slug;
  if (data.title && data.title !== existing.title) {
    slug = await resolveUniqueSlug(tenantId, titleToSlug(data.title), productId);
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
      // 1. Update product + increment version
      const product = await tx.product.update({
        where: { id: productId, tenantId },
        data: {
          ...(data.title !== undefined && { title: data.title, slug }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.currency !== undefined && { currency: data.currency }),
          ...(data.compareAtPrice !== undefined && { compareAtPrice: data.compareAtPrice }),
          ...(data.taxable !== undefined && { taxable: data.taxable }),
          ...(data.trackInventory !== undefined && { trackInventory: data.trackInventory }),
          ...(data.inventoryQuantity !== undefined && { inventoryQuantity: data.inventoryQuantity }),
          ...(data.continueSellingWhenOutOfStock !== undefined && { continueSellingWhenOutOfStock: data.continueSellingWhenOutOfStock }),
          ...(mergedSeoJson !== undefined && { seo: mergedSeoJson }),
          version: { increment: 1 },
        },
      });

      // Price history — log if price changed
      if (data.price !== undefined && data.price !== existing.price) {
        await tx.priceChange.create({
          data: {
            tenantId, productId,
            variantId: null,
            previousPrice: existing.price,
            newPrice: data.price,
            currency: data.currency ?? existing.currency,
            actorUserId: tenantData.clerkUserId,
          },
        });
      }

      // 2. Replace media
      if (data.media !== undefined) {
        await tx.productMedia.deleteMany({ where: { productId } });
        if (data.media.length > 0) {
          await tx.productMedia.createMany({
            data: data.media.map((m, i) => ({
              productId, url: m.url, type: m.type, alt: m.alt,
              filename: m.filename, width: m.width ?? null, height: m.height ?? null,
              sortOrder: i,
            })),
          });
        }
      }

      // 3. Replace options
      if (data.options !== undefined) {
        await tx.productOption.deleteMany({ where: { productId } });
        if (data.options.length > 0) {
          await tx.productOption.createMany({
            data: data.options.map((o, i) => ({
              productId, name: o.name, values: o.values, sortOrder: i,
            })),
          });
        }
      }

      // 4. Replace variants (with price history for each)
      if (data.variants !== undefined) {
        // Get old variants for price comparison
        const oldVariants = await tx.productVariant.findMany({
          where: { productId },
          select: { option1: true, option2: true, option3: true, price: true },
        });
        const oldPriceMap = new Map(
          oldVariants.map((v) => [`${v.option1}|${v.option2}|${v.option3}`, v.price]),
        );

        await tx.productVariant.deleteMany({ where: { productId } });

        if (data.variants.length > 0) {
          await tx.productVariant.createMany({
            data: data.variants.map((v, i) => ({
              productId,
              option1: v.option1 ?? null, option2: v.option2 ?? null, option3: v.option3 ?? null,
              price: v.price, compareAtPrice: v.compareAtPrice ?? null,
              sku: v.sku ?? null, trackInventory: v.trackInventory,
              inventoryQuantity: v.inventoryQuantity,
              continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
              sortOrder: i, version: 1,
            })),
          });

          // Log price changes for variants
          const newVariants = await tx.productVariant.findMany({
            where: { productId },
            orderBy: { sortOrder: "asc" },
          });
          for (const nv of newVariants) {
            const key = `${nv.option1}|${nv.option2}|${nv.option3}`;
            const oldPrice = oldPriceMap.get(key);
            if (oldPrice !== undefined && oldPrice !== nv.price) {
              await tx.priceChange.create({
                data: {
                  tenantId, productId, variantId: nv.id,
                  previousPrice: oldPrice, newPrice: nv.price,
                  currency: data.currency ?? existing.currency,
                  actorUserId: tenantData.clerkUserId,
                },
              });
            }
          }
        }
      }

      // 5. Replace collections (preserve existing sortOrder within each collection)
      if (data.collectionIds !== undefined) {
        // Get existing sort positions before deleting
        const existingItems = await tx.productCollectionItem.findMany({
          where: { productId },
          select: { collectionId: true, sortOrder: true },
        });
        const existingSortMap = new Map(existingItems.map((i) => [i.collectionId, i.sortOrder]));

        await tx.productCollectionItem.deleteMany({ where: { productId } });
        if (data.collectionIds.length > 0) {
          const collections = await tx.productCollection.findMany({
            where: { id: { in: data.collectionIds }, tenantId },
            select: { id: true },
          });
          const validIds = new Set(collections.map((c) => c.id));
          const memberships = data.collectionIds
            .filter((id) => validIds.has(id))
            .map((collectionId) => ({
              collectionId, productId,
              sortOrder: existingSortMap.get(collectionId) ?? 0,
            }));
          if (memberships.length > 0) {
            await tx.productCollectionItem.createMany({ data: memberships });
          }
        }
      }

      // 6. Replace tags
      if (data.tags !== undefined) {
        await tx.productTagItem.deleteMany({ where: { productId } });
        for (const rawTag of data.tags) {
          const name = rawTag.trim().toLowerCase();
          if (!name) continue;
          const tag = await tx.productTag.upsert({
            where: { tenantId_name: { tenantId, name } },
            create: { tenantId, name },
            update: {},
          });
          await tx.productTagItem.create({
            data: { productId, tagId: tag.id },
          }).catch(() => {});
        }
      }

      return product;
    });

    if (data.seo !== undefined) {
      log("info", "seo.entity.seo_updated", {
        tenantId,
        resourceType: "product",
        entityId: productId,
        fieldsChanged: Object.keys(data.seo).join(","),
      });
    }

    revalidatePath("/(guest)", "layout");
    return { ok: true, data: { id: product.id, slug: product.slug, version: product.version } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "En produkt med denna URL finns redan." };
    }
    throw error;
  }
}

/**
 * Soft-delete: archives the product (ARCHIVED status + archivedAt).
 * Data is preserved. Product is hidden from storefront.
 * Use restoreProduct() to unarchive.
 */
export async function archiveProduct(productId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: tenantData.tenant.id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Produkten hittades inte" };

  await prisma.product.update({
    where: { id: productId, tenantId: tenantData.tenant.id },
    data: { status: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } },
  });

  revalidatePath("/(guest)", "layout");
  return { ok: true, data: undefined };
}

/**
 * Restore an archived product back to DRAFT status.
 */
export async function restoreProduct(productId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: tenantData.tenant.id, status: "ARCHIVED" },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Produkten hittades inte eller är inte arkiverad" };

  await prisma.product.update({
    where: { id: productId, tenantId: tenantData.tenant.id },
    data: { status: "DRAFT", archivedAt: null, version: { increment: 1 } },
  });

  revalidatePath("/(guest)", "layout");
  return { ok: true, data: undefined };
}

/**
 * Permanently delete a product and all related data.
 * Only allowed if the product has no associated orders.
 */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: tenantData.tenant.id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Produkten hittades inte" };

  // Check for order line items referencing this product
  const orderCount = await prisma.orderLineItem.count({
    where: { productId },
  });
  if (orderCount > 0) {
    return { ok: false, error: "Produkten kan inte raderas — den har kopplingar till ordrar. Arkivera istället." };
  }

  await prisma.product.delete({
    where: { id: productId, tenantId: tenantData.tenant.id },
  });

  revalidatePath("/(admin)/products", "page");
  revalidatePath("/(guest)", "layout");
  return { ok: true, data: undefined };
}

export async function getProduct(productId: string) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  return prisma.product.findFirst({
    where: { id: productId, tenantId: tenantData.tenant.id },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      options: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      collectionItems: {
        include: { collection: { select: { id: true, title: true } } },
      },
      tags: {
        include: { tag: { select: { id: true, name: true } } },
      },
    },
  });
}

/**
 * Search products by title (for collection product picker, etc.)
 * Returns lightweight results: id, title, first image, status, price.
 */
export async function searchProducts(query: string, excludeIds?: string[]) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  return prisma.product.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      status: { not: "ARCHIVED" },
      title: { contains: query, mode: "insensitive" },
      ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      price: true,
      currency: true,
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
    orderBy: { title: "asc" },
    take: 20,
  });
}

export async function listProducts(params?: {
  status?: "ACTIVE" | "DRAFT";
  collectionId?: string;
  includeArchived?: boolean;
}) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const where: Record<string, unknown> = { tenantId: tenantData.tenant.id };

  // By default exclude archived products
  if (!params?.includeArchived) {
    where.status = params?.status ? params.status : { not: "ARCHIVED" };
  } else if (params?.status) {
    where.status = params.status;
  }

  if (params?.collectionId) {
    where.collectionItems = { some: { collectionId: params.collectionId } };
  }

  return prisma.product.findMany({
    where,
    include: {
      media: { orderBy: { sortOrder: "asc" }, take: 1 },
      variants: {
        select: { id: true, price: true, option1: true, trackInventory: true, inventoryQuantity: true },
        orderBy: { sortOrder: "asc" },
      },
      collectionItems: {
        include: { collection: { select: { id: true, title: true } } },
        take: 3,
      },
      _count: { select: { variants: true, collectionItems: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Get inventory history for a product (or specific variant).
 */
export async function getInventoryHistory(
  productId: string,
  variantId?: string,
) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const where: Record<string, unknown> = {
    productId,
    tenantId: tenantData.tenant.id,
  };
  if (variantId) where.variantId = variantId;

  return prisma.inventoryChange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Get price history for a product (or specific variant).
 */
export async function getPriceHistory(
  productId: string,
  variantId?: string,
) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const where: Record<string, unknown> = {
    productId,
    tenantId: tenantData.tenant.id,
  };
  if (variantId) where.variantId = variantId;

  return prisma.priceChange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ═════════════════════════════════════════════════════════════
// COLLECTION CRUD
// ═════════════════════════════════════════════════════════════

export async function createCollection(
  input: z.input<typeof CreateCollectionSchema>,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const parsed = CreateCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valideringsfel" };
  }

  const data = parsed.data;
  const slug = await resolveUniqueCollectionSlug(tenantId, titleToSlug(data.title));

  try {
    const collection = await prisma.$transaction(async (tx) => {
      const col = await tx.productCollection.create({
        data: {
          tenantId, title: data.title, description: data.description,
          slug, imageUrl: data.imageUrl ?? null, status: data.status,
        },
      });
      if (data.productIds.length > 0) {
        // Validate all products belong to this tenant
        const products = await tx.product.findMany({
          where: { id: { in: data.productIds }, tenantId },
          select: { id: true },
        });
        const validIds = new Set(products.map((p) => p.id));
        const memberships = data.productIds
          .filter((id) => validIds.has(id))
          .map((productId, i) => ({ collectionId: col.id, productId, sortOrder: i }));
        if (memberships.length > 0) {
          await tx.productCollectionItem.createMany({ data: memberships });
        }
      }
      return col;
    });
    revalidatePath("/(guest)", "layout");
    return { ok: true, data: { id: collection.id, slug: collection.slug } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "En kategori med denna URL finns redan." };
    }
    throw error;
  }
}

export async function updateCollection(
  collectionId: string,
  input: UpdateCollectionInput,
): Promise<ActionResult<{ id: string; slug: string; version: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const parsed = UpdateCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valideringsfel" };
  }

  const existing = await prisma.productCollection.findFirst({
    where: { id: collectionId, tenantId },
    select: { id: true, slug: true, title: true, version: true },
  });
  if (!existing) return { ok: false, error: "Kategorin hittades inte" };

  const data = parsed.data;

  // Optimistic locking check
  if (data.expectedVersion !== undefined && data.expectedVersion !== existing.version) {
    return { ok: false, error: "Produktserien har ändrats av någon annan. Ladda om och försök igen.", code: "VERSION_CONFLICT" };
  }

  let slug = existing.slug;
  if (data.title && data.title !== existing.title) {
    slug = await resolveUniqueCollectionSlug(tenantId, titleToSlug(data.title), collectionId);
  }

  try {
    const collection = await prisma.$transaction(async (tx) => {
      const col = await tx.productCollection.update({
        where: { id: collectionId },
        data: {
          ...(data.title !== undefined && { title: data.title, slug }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
          ...(data.status !== undefined && { status: data.status }),
          version: { increment: 1 },
        },
      });
      if (data.productIds !== undefined) {
        await tx.productCollectionItem.deleteMany({ where: { collectionId } });
        if (data.productIds.length > 0) {
          // Validate all products belong to this tenant
          const products = await tx.product.findMany({
            where: { id: { in: data.productIds }, tenantId },
            select: { id: true },
          });
          const validIds = new Set(products.map((p) => p.id));
          const memberships = data.productIds
            .filter((id) => validIds.has(id))
            .map((productId, i) => ({ collectionId, productId, sortOrder: i }));
          if (memberships.length > 0) {
            await tx.productCollectionItem.createMany({ data: memberships });
          }
        }
      }
      return col;
    });
    revalidatePath("/(guest)", "layout");
    return { ok: true, data: { id: collection.id, slug: collection.slug, version: collection.version } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "En kategori med denna URL finns redan." };
    }
    throw error;
  }
}

export async function deleteCollection(collectionId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.productCollection.findFirst({
    where: { id: collectionId, tenantId: tenantData.tenant.id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Kategorin hittades inte" };

  await prisma.productCollection.delete({
    where: { id: collectionId, tenantId: tenantData.tenant.id },
  });
  revalidatePath("/(guest)", "layout");
  return { ok: true, data: undefined };
}

export async function listCollections() {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  return prisma.productCollection.findMany({
    where: { tenantId: tenantData.tenant.id },
    include: { _count: { select: { items: true } } },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Lightweight collection summaries for the editor collection picker.
 * Returns non-archived collections with product count, ordered by title.
 */
export type CollectionSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: string;
  productCount: number;
};

export async function getCollectionSummaries(): Promise<CollectionSummary[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const collections = await prisma.productCollection.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      status: { not: "ARCHIVED" },
    },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      status: true,
      _count: { select: { items: true } },
    },
    orderBy: { title: "asc" },
  });

  return collections.map((c) => ({
    id: c.id,
    title: c.title,
    imageUrl: c.imageUrl,
    status: c.status,
    productCount: c._count.items,
  }));
}

/**
 * Lightweight product summaries for the editor product picker.
 * Returns non-archived products with featured image, ordered by title.
 */
export type ProductSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: string;
  price: number;
  currency: string;
};

export async function getProductSummaries(): Promise<ProductSummary[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const products = await prisma.product.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      status: { not: "ARCHIVED" },
    },
    select: {
      id: true,
      title: true,
      status: true,
      price: true,
      currency: true,
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
    orderBy: { title: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    title: p.title,
    imageUrl: p.media[0]?.url ?? null,
    status: p.status,
    price: p.price,
    currency: p.currency,
  }));
}

/**
 * Lightweight accommodation summaries for the editor resource picker.
 * Returns active accommodations ordered by sortOrder.
 */
export type AccommodationSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
};

export async function getAccommodationSummaries(): Promise<AccommodationSummary[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const accommodations = await prisma.accommodation.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      status: "ACTIVE",
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      nameOverride: true,
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return accommodations.map((a) => ({
    id: a.id,
    title: a.nameOverride ?? a.name,
    imageUrl: a.media[0]?.url ?? null,
  }));
}

// ═════════════════════════════════════════════════════════════
// PMS SYNC ACTION
// ═════════════════════════════════════════════════════════════

/**
 * @deprecated Use syncAccommodations() from @/app/_lib/accommodations instead.
 */
export async function syncPmsProductsAction(): Promise<
  ActionResult<{ created: number; updated: number; unchanged: number; errors: string[] }>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const { syncAccommodations } = await import("@/app/_lib/accommodations");
  const result = await syncAccommodations(tenantData.tenant.id);
  return { ok: true, data: result };
}

// ═════════════════════════════════════════════════════════════
// ACCOMMODATION TYPES — public query
// ═════════════════════════════════════════════════════════════

/**
 * Get the name of the product used for editor preview.
 * Returns the first active product's display title (PMS preferred).
 */
export async function getPreviewProductName(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const product = await prisma.product.findFirst({
    where: { tenantId: tenantData.tenant.id, status: "ACTIVE" },
    orderBy: [{ productType: "desc" }, { createdAt: "asc" }],
    select: { title: true },
  });

  if (!product) return null;
  return product.title;
}

/**
 * Returns accommodation type collections.
 * Stubbed — accommodation type flag removed from collections.
 */
export async function getAccommodationTypes(_tenantId: string) {
  return [] as { id: string; title: string; slug: string; imageUrl: string | null }[];
}

// ═════════════════════════════════════════════════════════════
// GUEST-FACING: Product by slug
// ═════════════════════════════════════════════════════════════

/**
 * Fetch a single ACTIVE product by slug for the guest portal.
 *
 * Tenant resolved from Host header (same pattern as accommodation pages).
 * Returns null if product not found or not ACTIVE.
 * This is the single entry point — no direct Prisma queries in page components.
 */
/**
 * Check if a slug belongs to an accommodation (not a product).
 * Used by shop/products/[slug] to redirect to /stays/[slug].
 */
export async function isAccommodationSlug(slug: string): Promise<boolean> {
  const { resolveTenantFromHost } = await import(
    "@/app/(guest)/_lib/tenant/resolveTenantFromHost"
  );
  const tenant = await resolveTenantFromHost();
  if (!tenant) return false;

  const accommodation = await prisma.accommodation.findFirst({
    where: { tenantId: tenant.id, slug, archivedAt: null },
    select: { id: true },
  });
  return !!accommodation;
}

export async function getProductBySlug(slug: string): Promise<ResolvedProduct | null> {
  // Lazy import to avoid pulling guest-only code into admin bundles
  const { resolveTenantFromHost } = await import(
    "@/app/(guest)/_lib/tenant/resolveTenantFromHost"
  );
  const tenant = await resolveTenantFromHost();
  if (!tenant) return null;

  const product = await prisma.product.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      options: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      template: { select: { id: true, suffix: true } },
    },
  });

  if (!product || product.status !== "ACTIVE") return null;

  return resolveProduct(product);
}

// ═════════════════════════════════════════════════════════════
// TEMPLATE ASSIGNMENT
// ═════════════════════════════════════════════════════════════

/**
 * Assign (or clear) a ProductTemplate on a product.
 * This is the ONLY place Product.templateId is written.
 */
export async function assignProductTemplate(
  productId: string,
  templateId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Unauthorized" };
  const tenantId = tenantData.tenant.id;

  // Verify product belongs to tenant
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true },
  });
  if (!product) return { ok: false, error: "Produkten hittades inte." };

  // If assigning a template, verify it belongs to the same tenant
  if (templateId !== null && templateId !== undefined) {
    if (templateId === "") {
      return { ok: false, error: "Ogiltigt mall-ID." };
    }
    const template = await prisma.productTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { id: true },
    });
    if (!template) return { ok: false, error: "Mallen hittades inte." };
  }

  await prisma.product.update({
    where: { id: productId, tenantId },
    data: { templateId },
  });

  return { ok: true, data: undefined };
}
