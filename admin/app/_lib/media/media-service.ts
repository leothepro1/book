/**
 * Media Service
 * ─────────────
 * Orchestrates media operations: upload pipeline with rollback,
 * query, update, delete, and cleanup.
 *
 * This is the primary entry point for all media operations.
 * Routes call this — never the repository or Cloudinary directly.
 */

import type { Tenant } from "@prisma/client";
import type { MediaQuery, MediaPage, UploadResult, MediaAssetDTO } from "./types";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./types";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  buildTenantFolder,
  ensureCloudinaryFolder,
} from "./cloudinary-service";
import {
  createMediaAsset,
  getMediaAssetById,
  getMediaAssetByPublicId,
  queryMediaAssets,
  updateMediaAsset,
  softDeleteMediaAsset,
  findExpiredSoftDeletes,
  hardDeleteMediaAsset,
  countMediaAssets,
  countMediaAssetsByFolder,
} from "./media-repository";

// ─── Upload Pipeline ────────────────────────────────────────

export type UploadParams = {
  tenant: Tenant;
  userId: string;
  file: File;
  folder?: string;
  alt?: string;
  title?: string;
};

/**
 * Full upload pipeline:
 * 1. Validate file (type, size)
 * 2. Upload to Cloudinary
 * 3. Create DB record
 * 4. On DB failure → rollback Cloudinary upload
 */
export async function uploadMedia(params: UploadParams): Promise<UploadResult> {
  const { tenant, userId, file, folder = "general", alt, title } = params;

  // ── Validate ──
  if (!file || file.size === 0) {
    throw new MediaError("No file provided", "INVALID_INPUT");
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
    throw new MediaError(`File type "${file.type}" is not allowed`, "INVALID_FILE_TYPE");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new MediaError(
      `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      "FILE_TOO_LARGE"
    );
  }

  // ── Folder provisioning (first upload only) ──
  const assetCount = await countMediaAssets(tenant.id);
  if (assetCount === 0) {
    try {
      await ensureCloudinaryFolder(buildTenantFolder(tenant.slug));
    } catch (err) {
      console.warn("[MediaService] Folder provisioning failed (non-fatal):", err);
    }
  }

  // ── Upload to Cloudinary ──
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const cloudinaryFolder = buildTenantFolder(tenant.slug, folder);

  const isWallpaper = folder === "wallpaper";
  const isPdf = file.type === "application/pdf";
  const transformation = isPdf
    ? undefined
    : isWallpaper
      ? [
          { width: 2000, crop: "limit" },
          { quality: "auto:low", fetch_format: "auto" },
          { flags: "strip_profile" },
        ]
      : [{ quality: "auto", fetch_format: "auto" }];

  const cloudinaryResult = await uploadToCloudinary(buffer, {
    folder: cloudinaryFolder,
    tags: [tenant.slug, folder, userId],
    ...(transformation && { transformation }),
    ...(isWallpaper && {
      eager: [
        { width: 1200, crop: "limit", quality: "auto:low", fetch_format: "auto" },
        { width: 640, crop: "limit", quality: "auto:low", fetch_format: "auto" },
      ],
    }),
  });

  // ── Create DB record (with rollback on failure) ──
  let dbRecord;
  try {
    dbRecord = await createMediaAsset({
      tenantId: tenant.id,
      publicId: cloudinaryResult.public_id,
      url: cloudinaryResult.secure_url,
      resourceType: cloudinaryResult.resource_type,
      filename: file.name || cloudinaryResult.original_filename || "untitled",
      mimeType: file.type,
      bytes: cloudinaryResult.bytes,
      width: cloudinaryResult.width || null,
      height: cloudinaryResult.height || null,
      format: cloudinaryResult.format,
      folder,
      alt: alt ?? "",
      title: title ?? "",
      uploadedBy: userId,
    });
  } catch (dbError) {
    // Rollback: delete from Cloudinary since DB insert failed
    console.error("[MediaService] DB insert failed, rolling back Cloudinary upload:", dbError);
    try {
      await deleteFromCloudinary(cloudinaryResult.public_id);
    } catch (rollbackError) {
      // Log but don't throw — the original error is more important
      console.error("[MediaService] Cloudinary rollback also failed:", rollbackError);
    }
    throw new MediaError("Failed to save media record", "DB_ERROR");
  }

  return {
    id: dbRecord.id,
    publicId: dbRecord.publicId,
    url: dbRecord.url,
    filename: dbRecord.filename,
    mimeType: dbRecord.mimeType,
    bytes: dbRecord.bytes,
    width: dbRecord.width,
    height: dbRecord.height,
    format: dbRecord.format,
    folder: dbRecord.folder,
  };
}

// ─── Query ──────────────────────────────────────────────────

export async function listMedia(
  tenantId: string,
  query: MediaQuery = {}
): Promise<MediaPage> {
  return queryMediaAssets(tenantId, query);
}

export async function getMedia(
  id: string,
  tenantId: string
): Promise<MediaAssetDTO | null> {
  const asset = await getMediaAssetById(id, tenantId);
  if (!asset) return null;
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

export async function getMediaByPublicId(
  publicId: string,
  tenantId: string
): Promise<MediaAssetDTO | null> {
  const asset = await getMediaAssetByPublicId(publicId, tenantId);
  if (!asset) return null;
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

// ─── Update ─────────────────────────────────────────────────

export type UpdateMediaParams = {
  id: string;
  tenantId: string;
  alt?: string;
  title?: string;
  folder?: string;
};

export async function updateMedia(params: UpdateMediaParams): Promise<MediaAssetDTO | null> {
  const { id, tenantId, ...data } = params;
  const updated = await updateMediaAsset(id, tenantId, data);
  if (!updated) return null;
  return {
    id: updated.id,
    publicId: updated.publicId,
    url: updated.url,
    resourceType: updated.resourceType,
    filename: updated.filename,
    mimeType: updated.mimeType,
    bytes: updated.bytes,
    width: updated.width,
    height: updated.height,
    format: updated.format,
    folder: updated.folder,
    alt: updated.alt,
    title: updated.title,
    uploadedBy: updated.uploadedBy,
    deletedAt: updated.deletedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

// ─── Delete ─────────────────────────────────────────────────

/**
 * Soft-delete a media asset.
 * The asset remains in Cloudinary until the cleanup job runs.
 * This allows undo within the grace period.
 */
export async function deleteMedia(
  id: string,
  tenantId: string,
  deletedBy: string
): Promise<boolean> {
  const deleted = await softDeleteMediaAsset(id, tenantId, deletedBy);
  return deleted !== null;
}

/**
 * Cleanup job: permanently delete assets that were soft-deleted
 * more than `gracePeriodMs` ago.
 *
 * Call from a cron job or background task.
 * Processes in batches of 100.
 */
export async function cleanupDeletedMedia(
  gracePeriodMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<{ processed: number; errors: number }> {
  const expired = await findExpiredSoftDeletes(gracePeriodMs);
  let processed = 0;
  let errors = 0;

  for (const asset of expired) {
    try {
      // Delete from Cloudinary first
      await deleteFromCloudinary(asset.publicId, asset.resourceType);
      // Then delete DB record
      await hardDeleteMediaAsset(asset.id);
      processed++;
    } catch (err) {
      console.error(`[MediaService] Cleanup failed for asset ${asset.id}:`, err);
      errors++;
    }
  }

  return { processed, errors };
}

// ─── Stats ──────────────────────────────────────────────────

export async function getMediaStats(tenantId: string) {
  const [total, byFolder] = await Promise.all([
    countMediaAssets(tenantId),
    countMediaAssetsByFolder(tenantId),
  ]);
  return { total, byFolder };
}

// ─── Folder Provisioning ────────────────────────────────────

/**
 * Ensure the tenant's Cloudinary folder structure exists.
 * Called once when a tenant first uses the media library.
 */
export async function provisionTenantFolders(tenantSlug: string): Promise<void> {
  const rootFolder = buildTenantFolder(tenantSlug);
  await ensureCloudinaryFolder(rootFolder);
}

// ─── Tenant Prefix Validation ───────────────────────────────

/**
 * Validate that a publicId belongs to the given tenant.
 * Prevents cross-tenant access to Cloudinary resources.
 */
export function validateTenantPrefix(publicId: string, tenantSlug: string): boolean {
  return publicId.startsWith(`hospitality/${tenantSlug}/`);
}

// ─── Error Type ─────────────────────────────────────────────

export type MediaErrorCode =
  | "INVALID_INPUT"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "DB_ERROR"
  | "CLOUDINARY_ERROR";

export class MediaError extends Error {
  constructor(
    message: string,
    public readonly code: MediaErrorCode
  ) {
    super(message);
    this.name = "MediaError";
  }

  get statusCode(): number {
    switch (this.code) {
      case "INVALID_INPUT":
      case "INVALID_FILE_TYPE":
      case "FILE_TOO_LARGE":
        return 400;
      case "NOT_FOUND":
        return 404;
      case "FORBIDDEN":
        return 403;
      default:
        return 500;
    }
  }
}
