/**
 * Section Data Sources — Server-Side Data Resolution
 * ═══════════════════════════════════════════════════
 *
 * Sections can declare external data requirements via `dataSources`
 * on their SectionDefinition. This module resolves those requirements
 * by batch-fetching data from the database before rendering.
 *
 * Pipeline integration:
 *   resolvePageItems()  → resolveDataSources()  → render
 *   (static config)       (live product data)      (client)
 *
 * Design principles:
 *   1. Batch fetching — ONE query per data type, not per section
 *   2. Deduplication — same collection referenced by 3 sections = 1 fetch
 *   3. Fail-safe — DB errors → empty maps, missing resources → null
 *   4. Serializable — all types are JSON-safe (no Prisma types leak)
 *   5. Bounded — product count capped per collection to prevent runaway queries
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { effectivePrice } from "@/app/_lib/products/pricing";
import { applyTranslationsBatch } from "@/app/_lib/translations/apply-db-translations";
import type { PageItem } from "./resolve";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/**
 * Maximum number of products fetched per collection.
 * Prevents unbounded queries for collections with hundreds of products.
 * Renderers can further slice via their own maxProducts setting.
 */
const MAX_PRODUCTS_PER_COLLECTION = 50;

// ═══════════════════════════════════════════════════════════════
// PUBLIC TYPES — consumed by section renderers
// ═══════════════════════════════════════════════════════════════

/**
 * Lightweight product data for display in section renderers.
 * Frozen snapshot — no Prisma types, fully serializable.
 */
export type ResolvedProductDisplay = {
  id: string;
  title: string;
  slug: string;
  /** Product description (HTML). */
  description: string;
  /** Effective price in smallest currency unit (ören). */
  price: number;
  currency: string;
  /** Strikethrough price, null if none. */
  compareAtPrice: number | null;
  /** Featured image (first by sortOrder), null if no media. */
  featuredImage: { url: string; alt: string } | null;
  /** All product images sorted by sortOrder. */
  images: Array<{ url: string; alt: string }>;
  productType: string;
  /** Facility type strings (accommodation-specific, optional). */
  facilities?: string[];
  /** Structured highlights (accommodation-specific, optional). */
  highlights?: Array<{ icon: string; text: string; description: string }>;
  /** Capacity info (accommodation-specific, optional). */
  capacity?: {
    maxGuests: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    roomSizeSqm: number | null;
    extraBeds: number;
  };
};

/**
 * Collection with its products, ready for rendering.
 */
export type ResolvedCollectionDisplay = {
  id: string;
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  /** Products sorted by collection item sortOrder. Only ACTIVE products included. */
  products: ResolvedProductDisplay[];
};

/**
 * Map of resolved data keyed by DataSourceDefinition.key.
 * Null values indicate the referenced resource was not found or deleted.
 */
export type ResolvedDataMap = Record<
  string,
  ResolvedCollectionDisplay | ResolvedProductDisplay | null
>;

// ═══════════════════════════════════════════════════════════════
// RESOLUTION PIPELINE
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve all data sources for a list of page items.
 *
 * Called ONCE per page render, after resolvePageItems().
 * Batches all collection/product IDs and fetches in minimal queries.
 * Mutates items in-place by setting renderProps.resolvedData.
 *
 * Never throws — DB errors are caught, logged, and result in empty data.
 * Missing or deleted resources resolve to null.
 */
export async function resolveDataSources(
  items: PageItem[],
  tenantId: string,
  locale?: string,
): Promise<void> {
  // ── 1. Collect all needed resource IDs ──

  type Requirement = {
    item: PageItem & { kind: "section" };
    dataSourceKey: string;
    type: "collection" | "product" | "accommodation";
    resourceId: string;
  };

  const requirements: Requirement[] = [];
  const collectionIds = new Set<string>();
  const productIds = new Set<string>();
  const accommodationIds = new Set<string>();

  for (const item of items) {
    if (item.kind !== "section") continue;

    const dataSources = item.renderProps.definition.dataSources;
    if (!dataSources || dataSources.length === 0) continue;

    for (const ds of dataSources) {
      const resourceId = item.renderProps.settings[ds.settingKey];
      if (typeof resourceId !== "string" || !resourceId) continue;

      requirements.push({
        item: item as PageItem & { kind: "section" },
        dataSourceKey: ds.key,
        type: ds.type,
        resourceId,
      });

      if (ds.type === "collection") collectionIds.add(resourceId);
      if (ds.type === "product") productIds.add(resourceId);
      if (ds.type === "accommodation") accommodationIds.add(resourceId);
    }
  }

  // Nothing to fetch — short-circuit without touching the database
  if (requirements.length === 0) return;

  // ── 2. Batch fetch (fail-safe: catch DB errors) ──

  let collectionMap = new Map<string, ResolvedCollectionDisplay>();
  let productMap = new Map<string, ResolvedProductDisplay>();

  try {
    const [cMap, pMap] = await Promise.all([
      collectionIds.size > 0
        ? fetchCollections([...collectionIds], tenantId, locale)
        : new Map<string, ResolvedCollectionDisplay>(),
      productIds.size > 0
        ? fetchProducts([...productIds], tenantId, locale)
        : new Map<string, ResolvedProductDisplay>(),
    ]);
    collectionMap = cMap;
    productMap = pMap;
  } catch (err) {
    log("error", "data_sources.fetch_failed", {
      tenantId,
      collectionCount: collectionIds.size,
      productCount: productIds.size,
      error: err instanceof Error ? err.message : String(err),
    });
    // Graceful degradation: sections render without resolvedData (null)
  }

  // ── 3. Assign resolved data to each section ──

  for (const req of requirements) {
    const renderProps = req.item.renderProps;
    if (!renderProps.resolvedData) {
      renderProps.resolvedData = {};
    }

    if (req.type === "collection") {
      renderProps.resolvedData[req.dataSourceKey] =
        collectionMap.get(req.resourceId) ?? null;
    } else if (req.type === "product") {
      renderProps.resolvedData[req.dataSourceKey] =
        productMap.get(req.resourceId) ?? null;
    } else if (req.type === "accommodation") {
      // Accommodation fetcher will be added when accommodation sections are created
      renderProps.resolvedData[req.dataSourceKey] = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL FETCHERS
// ═══════════════════════════════════════════════════════════════

async function fetchCollections(
  ids: string[],
  tenantId: string,
  locale?: string,
): Promise<Map<string, ResolvedCollectionDisplay>> {
  const collections = await prisma.productCollection.findMany({
    where: {
      id: { in: ids },
      tenantId,
      status: "ACTIVE",
    },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        take: MAX_PRODUCTS_PER_COLLECTION,
        include: {
          product: {
            include: {
              media: { orderBy: { sortOrder: "asc" } },
              variants: { select: { price: true } },
            },
          },
        },
      },
    },
  });

  const map = new Map<string, ResolvedCollectionDisplay>();

  for (const col of collections) {
    const products: ResolvedProductDisplay[] = [];

    for (const item of col.items) {
      const product = item.product;
      if (product.status !== "ACTIVE") continue;

      products.push(toProductDisplay(product));
    }

    map.set(col.id, {
      id: col.id,
      title: col.title,
      slug: col.slug,
      description: col.description ?? "",
      imageUrl: col.imageUrl,
      products,
    });
  }

  // Apply translations to collections and their products
  if (locale) {
    const allCollections = [...map.values()];
    await applyTranslationsBatch(tenantId, locale, "collection", allCollections, ["title", "description"]);
    const allProducts = allCollections.flatMap((c) => c.products);
    if (allProducts.length > 0) {
      await applyTranslationsBatch(tenantId, locale, "product", allProducts, ["title", "description"]);
    }
  }

  return map;
}

async function fetchProducts(
  ids: string[],
  tenantId: string,
  locale?: string,
): Promise<Map<string, ResolvedProductDisplay>> {
  const products = await prisma.product.findMany({
    where: {
      id: { in: ids },
      tenantId,
      status: "ACTIVE",
    },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      variants: { select: { price: true } },
    },
  });

  const map = new Map<string, ResolvedProductDisplay>();

  for (const product of products) {
    map.set(product.id, toProductDisplay(product));
  }

  // Apply translations to standalone products
  if (locale) {
    const allProducts = [...map.values()];
    await applyTranslationsBatch(tenantId, locale, "product", allProducts, ["title", "description"]);
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════
// SHARED TRANSFORM
// ═══════════════════════════════════════════════════════════════

/**
 * Transform a Prisma product (with media + variants included) into
 * the serializable ResolvedProductDisplay shape.
 */
function toProductDisplay(
  product: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    price: number;
    currency: string;
    compareAtPrice: number | null;
    productType: string;
    media: Array<{ url: string; alt: string }>;
    variants: Array<{ price: number }>;
  },
): ResolvedProductDisplay {
  const images = product.media.map((m) => ({ url: m.url, alt: m.alt }));
  const firstMedia = images[0] ?? null;
  const price =
    product.variants.length > 0
      ? Math.min(
          ...product.variants.map((v) =>
            effectivePrice(product.price, v.price),
          ),
        )
      : product.price;

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description ?? "",
    price,
    currency: product.currency,
    compareAtPrice: product.compareAtPrice,
    featuredImage: firstMedia,
    images,
    productType: product.productType,
  };
}
