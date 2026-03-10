/**
 * Media Library — Public API
 * ──────────────────────────
 * Re-exports everything consumers need.
 */

// Service (primary API)
export {
  uploadMedia,
  listMedia,
  getMedia,
  getMediaByPublicId,
  updateMedia,
  deleteMedia,
  cleanupDeletedMedia,
  getMediaStats,
  provisionTenantFolders,
  validateTenantPrefix,
  MediaError,
} from "./media-service";

export type {
  UploadParams,
  UpdateMediaParams,
  MediaErrorCode,
} from "./media-service";

// Types
export type {
  MediaQuery,
  MediaPage,
  MediaAssetDTO,
  UploadResult,
  ValidFolder,
} from "./types";

export {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  DEFAULT_PAGE_SIZE,
  VALID_FOLDERS,
} from "./types";

// Cloudinary service (for advanced use)
export {
  buildTenantFolder,
} from "./cloudinary-service";
