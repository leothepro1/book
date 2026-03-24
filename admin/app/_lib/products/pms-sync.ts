/**
 * PMS Product Sync
 * ════════════════
 *
 * The ONLY place that creates or updates PMS_ACCOMMODATION products.
 * Also maintains accommodation type collections (isAccommodationType).
 *
 * Key invariants:
 * - titleOverride and descriptionOverride are NEVER touched by sync
 * - Tenant-customized collection titles are NEVER overwritten
 * - Sync errors are per-item — one failure never aborts full sync
 * - Price/variants/options/inventory are not set (PMS controls them)
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { titleToSlug } from "./types";

// ── Types ──────────────────────────────────────────────────────

export interface PmsSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ pmsSourceId: string; error: string }>;
  collections: { created: number; updated: number };
}

// ── Accommodation collection definitions ───────────────────────
// Defined ONCE — used by sync to auto-create collections.

const ACCOMMODATION_COLLECTIONS = [
  { slug: "hotell", title: "Hotell", pmsTypes: ["HOTEL"] },
  { slug: "stugor", title: "Stugor", pmsTypes: ["CABIN"] },
  { slug: "campingtomter", title: "Campingtomter", pmsTypes: ["CAMPING"] },
  { slug: "lagenheter", title: "Lägenheter", pmsTypes: ["APARTMENT"] },
] as const;

// ── Main sync ──────────────────────────────────────────────────

export async function syncPmsProducts(
  tenantId: string,
  provider: string,
): Promise<PmsSyncResult> {
  const adapter = await resolveAdapter(tenantId);
  const roomTypes = await adapter.getRoomTypes(tenantId);

  const result: PmsSyncResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    collections: { created: 0, updated: 0 },
  };

  // ── Upsert products ─────────────────────────────────────────
  for (const room of roomTypes) {
    try {
      const pmsSourceId = room.externalId;
      const pmsDataJson = JSON.parse(JSON.stringify(room));

      const existing = await prisma.product.findFirst({
        where: { tenantId, pmsSourceId, pmsProvider: provider },
        select: { id: true, pmsData: true },
      });

      if (!existing) {
        const slug = await resolveUniquePmsSlug(tenantId, titleToSlug(room.name));

        await prisma.product.create({
          data: {
            tenantId,
            productType: "PMS_ACCOMMODATION",
            title: room.name,
            description: room.longDescription || room.shortDescription,
            slug,
            status: "ACTIVE",
            price: 0,
            currency: "SEK",
            pmsSourceId,
            pmsProvider: provider,
            pmsSyncedAt: new Date(),
            pmsData: pmsDataJson,
          },
        });
        result.created++;
      } else {
        const existingData = JSON.stringify(existing.pmsData);
        const newData = JSON.stringify(pmsDataJson);

        if (existingData !== newData) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              pmsData: pmsDataJson,
              pmsSyncedAt: new Date(),
              title: room.name,
              description: room.longDescription || room.shortDescription,
            },
          });
          result.updated++;
        } else {
          await prisma.product.update({
            where: { id: existing.id },
            data: { pmsSyncedAt: new Date() },
          });
          result.unchanged++;
        }
      }
    } catch (err) {
      result.errors.push({
        pmsSourceId: room.externalId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // ── Sync accommodation collections (after all products exist) ─
  try {
    const collResult = await syncAccommodationCollections(tenantId);
    result.collections = collResult;
  } catch (err) {
    console.error("[pms-sync] Collection sync failed:", err);
  }

  return result;
}

// ── Accommodation collection sync ──────────────────────────────

async function syncAccommodationCollections(
  tenantId: string,
): Promise<{ created: number; updated: number }> {
  const result = { created: 0, updated: 0 };

  for (const def of ACCOMMODATION_COLLECTIONS) {
    try {
      // Check if slug is taken by a non-accommodation collection
      const existingCollection = await prisma.productCollection.findUnique({
        where: { tenantId_slug: { tenantId, slug: def.slug } },
        select: { id: true, title: true, isAccommodationType: true },
      });

      if (existingCollection && !existingCollection.isAccommodationType) {
        console.warn(
          `[pms-sync] Slug "${def.slug}" is owned by a non-accommodation collection — skipping`,
        );
        continue;
      }

      // Upsert collection
      let collectionId: string;
      if (!existingCollection) {
        const col = await prisma.productCollection.create({
          data: {
            tenantId,
            title: def.title,
            slug: def.slug,
            description: "",
            status: "ACTIVE",
            isAccommodationType: true,
          },
        });
        collectionId = col.id;
        result.created++;
      } else {
        collectionId = existingCollection.id;
        // Only update title if tenant hasn't customized it
        if (existingCollection.title === def.title) {
          // Title matches default — no update needed
        }
        result.updated++;
      }

      // Find PMS products matching this collection's types
      const matchingProducts = await prisma.product.findMany({
        where: {
          tenantId,
          productType: "PMS_ACCOMMODATION",
        },
        select: { id: true, pmsData: true },
      });

      // Filter by pmsData.type matching this collection's pmsTypes
      const productIds = matchingProducts
        .filter((p) => {
          const data = p.pmsData as Record<string, unknown> | null;
          const type = data?.type as string | undefined;
          return type && (def.pmsTypes as readonly string[]).includes(type);
        })
        .map((p) => p.id);

      // Get existing memberships
      const existingItems = await prisma.productCollectionItem.findMany({
        where: { collectionId },
        select: { id: true, productId: true },
      });
      const existingProductIds = new Set(existingItems.map((i) => i.productId));

      // Add missing memberships
      const toAdd = productIds.filter((id) => !existingProductIds.has(id));
      if (toAdd.length > 0) {
        await prisma.productCollectionItem.createMany({
          data: toAdd.map((productId, i) => ({
            collectionId,
            productId,
            sortOrder: existingItems.length + i,
          })),
          skipDuplicates: true,
        });
      }

      // Remove memberships for products no longer matching
      const productIdSet = new Set(productIds);
      const toRemove = existingItems.filter((i) => !productIdSet.has(i.productId));
      if (toRemove.length > 0) {
        await prisma.productCollectionItem.deleteMany({
          where: { id: { in: toRemove.map((i) => i.id) } },
        });
      }
    } catch (err) {
      console.error(`[pms-sync] Failed to sync collection "${def.slug}":`, err);
    }
  }

  return result;
}

// ── Slug helper ────────────────────────────────────────────────

const MAX_SLUG_RETRIES = 10;

async function resolveUniquePmsSlug(
  tenantId: string,
  baseSlug: string,
): Promise<string> {
  const slug = baseSlug || "boende";
  for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const existing = await prisma.product.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}
