/**
 * Media Library Domain Types
 * ──────────────────────────
 * Shared types for the organization-scoped media library.
 * DB model lives in Prisma schema; these are the service-layer types.
 */

// ─── Upload ─────────────────────────────────────────────────

export type UploadInput = {
  file: File;
  folder?: string;
  alt?: string;
  title?: string;
};

export type UploadResult = {
  id: string;
  publicId: string;
  url: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  format: string;
  folder: string;
};

// ─── Query ──────────────────────────────────────────────────

export type MediaQuery = {
  folder?: string;
  mimeType?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  orderBy?: "createdAt" | "filename" | "bytes";
  orderDir?: "asc" | "desc";
  includeDeleted?: boolean;
};

export type MediaPage = {
  items: MediaAssetDTO[];
  nextCursor: string | null;
  totalCount: number;
};

// ─── DTO (what API routes return) ───────────────────────────

export type MediaAssetDTO = {
  id: string;
  publicId: string;
  url: string;
  resourceType: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  format: string;
  folder: string;
  alt: string;
  title: string;
  uploadedBy: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Cloudinary ─────────────────────────────────────────────

export type CloudinaryUploadOptions = {
  folder: string;
  tags?: string[];
  transformation?: Record<string, unknown>[];
  eager?: Record<string, unknown>[];
  resourceType?: "image" | "video" | "raw";
};

export type CloudinaryUploadResponse = {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  resource_type: string;
  original_filename: string;
};

// ─── Constants ──────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const VALID_FOLDERS = [
  "general",
  "cards",
  "wallpaper",
  "sections",
  "logos",
  "icons",
] as const;

export type ValidFolder = (typeof VALID_FOLDERS)[number];
