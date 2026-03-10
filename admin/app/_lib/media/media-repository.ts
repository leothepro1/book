/**
 * Media Repository
 * ────────────────
 * Database operations for MediaAsset records.
 * Pure data access — no business logic, no Cloudinary calls.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { MediaAsset, Prisma } from "@prisma/client";
import type { MediaQuery, MediaPage, MediaAssetDTO } from "./types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./types";

// ─── Create ─────────────────────────────────────────────────

export async function createMediaAsset(
  data: Prisma.MediaAssetUncheckedCreateInput
): Promise<MediaAsset> {
  return prisma.mediaAsset.create({ data });
}

// ─── Read ───────────────────────────────────────────────────

export async function getMediaAssetById(
  id: string,
  tenantId: string
): Promise<MediaAsset | null> {
  return prisma.mediaAsset.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
}

export async function getMediaAssetByPublicId(
  publicId: string,
  tenantId: string
): Promise<MediaAsset | null> {
  return prisma.mediaAsset.findFirst({
    where: { publicId, tenantId, deletedAt: null },
  });
}

// ─── Query (cursor-based pagination) ────────────────────────

export async function queryMediaAssets(
  tenantId: string,
  query: MediaQuery
): Promise<MediaPage> {
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const orderBy = query.orderBy ?? "createdAt";
  const orderDir = query.orderDir ?? "desc";

  const where: Prisma.MediaAssetWhereInput = {
    tenantId,
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(query.folder && { folder: query.folder }),
    ...(query.mimeType && { mimeType: { startsWith: query.mimeType } }),
    ...(query.search && {
      OR: [
        { filename: { contains: query.search, mode: "insensitive" as const } },
        { title: { contains: query.search, mode: "insensitive" as const } },
        { alt: { contains: query.search, mode: "insensitive" as const } },
      ],
    }),
  };

  // Get total count and items in parallel
  const [totalCount, items] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      take: limit + 1, // Fetch one extra to determine if there's a next page
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1, // Skip the cursor itself
      }),
    }),
  ]);

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].id : null;

  return {
    items: pageItems.map(toDTO),
    nextCursor,
    totalCount,
  };
}

// ─── Update ─────────────────────────────────────────────────

export async function updateMediaAsset(
  id: string,
  tenantId: string,
  data: { alt?: string; title?: string; folder?: string }
): Promise<MediaAsset | null> {
  // Verify ownership first
  const existing = await prisma.mediaAsset.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!existing) return null;

  return prisma.mediaAsset.update({
    where: { id },
    data,
  });
}

// ─── Soft Delete ────────────────────────────────────────────

export async function softDeleteMediaAsset(
  id: string,
  tenantId: string,
  deletedBy: string
): Promise<MediaAsset | null> {
  const existing = await prisma.mediaAsset.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!existing) return null;

  return prisma.mediaAsset.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy },
  });
}

// ─── Hard Delete (cleanup job) ──────────────────────────────

/**
 * Find assets soft-deleted more than `olderThanMs` ago.
 * Used by the cleanup job to find assets ready for Cloudinary deletion.
 */
export async function findExpiredSoftDeletes(
  olderThanMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
): Promise<MediaAsset[]> {
  const cutoff = new Date(Date.now() - olderThanMs);
  return prisma.mediaAsset.findMany({
    where: {
      deletedAt: { not: null, lt: cutoff },
    },
    take: 100, // Process in batches
  });
}

export async function hardDeleteMediaAsset(id: string): Promise<void> {
  await prisma.mediaAsset.delete({ where: { id } });
}

// ─── Bulk Operations ────────────────────────────────────────

export async function getMediaAssetsByIds(
  ids: string[],
  tenantId: string
): Promise<MediaAsset[]> {
  return prisma.mediaAsset.findMany({
    where: { id: { in: ids }, tenantId, deletedAt: null },
  });
}

export async function countMediaAssets(tenantId: string): Promise<number> {
  return prisma.mediaAsset.count({
    where: { tenantId, deletedAt: null },
  });
}

export async function countMediaAssetsByFolder(
  tenantId: string
): Promise<Record<string, number>> {
  const results = await prisma.mediaAsset.groupBy({
    by: ["folder"],
    where: { tenantId, deletedAt: null },
    _count: true,
  });
  const counts: Record<string, number> = {};
  for (const row of results) {
    counts[row.folder] = row._count;
  }
  return counts;
}

// ─── DTO Conversion ─────────────────────────────────────────

function toDTO(asset: MediaAsset): MediaAssetDTO {
  return {
    id: asset.id,
    publicId: asset.publicId,
    url: asset.url,
    resourceType: asset.resourceType,
    filename: asset.filename,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    format: asset.format,
    folder: asset.folder,
    alt: asset.alt,
    title: asset.title,
    uploadedBy: asset.uploadedBy,
    deletedAt: asset.deletedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}
