/**
 * Cloudinary Service
 * ──────────────────
 * Wraps all Cloudinary operations behind a typed interface.
 * Server-only — uses cloudinary SDK with API secret.
 */

import { cloudinary } from "@/app/_lib/cloudinary/server";
import type { CloudinaryUploadOptions, CloudinaryUploadResponse } from "./types";

// ─── Upload ─────────────────────────────────────────────────

export async function uploadToCloudinary(
  buffer: Buffer,
  options: CloudinaryUploadOptions
): Promise<CloudinaryUploadResponse> {
  return new Promise<CloudinaryUploadResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resourceType ?? "image",
        ...(options.tags && { tags: options.tags }),
        ...(options.transformation && { transformation: options.transformation }),
        ...(options.eager && { eager: options.eager }),
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload returned no result"));
        } else {
          resolve(result as unknown as CloudinaryUploadResponse);
        }
      }
    );
    stream.end(buffer);
  });
}

// ─── Delete ─────────────────────────────────────────────────

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: string = "image"
): Promise<{ result: string }> {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
  return result;
}

// ─── Exists ─────────────────────────────────────────────────

/**
 * Check if a resource exists in Cloudinary.
 * Returns metadata if found, null if not.
 */
export async function getCloudinaryResource(
  publicId: string,
  resourceType: string = "image"
): Promise<CloudinaryUploadResponse | null> {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });
    return result as unknown as CloudinaryUploadResponse;
  } catch {
    return null;
  }
}

// ─── Folder Provisioning ────────────────────────────────────

/**
 * Ensure a Cloudinary folder exists for the tenant.
 * Cloudinary creates folders implicitly on upload, but this
 * method can be used to pre-provision the root folder.
 */
export async function ensureCloudinaryFolder(folderPath: string): Promise<void> {
  try {
    await cloudinary.api.create_folder(folderPath);
  } catch (err: unknown) {
    // Folder already exists — that's fine
    if (err && typeof err === "object" && "http_code" in err && (err as any).http_code === 409) {
      return;
    }
    throw err;
  }
}

/**
 * Build the standard Cloudinary folder path for a tenant.
 */
export function buildTenantFolder(tenantSlug: string, subfolder?: string): string {
  const base = `hospitality/${tenantSlug}`;
  return subfolder ? `${base}/${subfolder}` : base;
}
