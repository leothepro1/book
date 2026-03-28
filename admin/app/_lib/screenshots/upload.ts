/**
 * Screenshot Upload — Cloudinary.
 *
 * Overwrites same public_id per tenant (no URL changes).
 * invalidate: true busts CDN cache globally.
 * PNG → JPG conversion + quality 85 for optimal size.
 */

import { cloudinary } from "@/app/_lib/cloudinary/server";
import { log } from "@/app/_lib/logger";

export interface UploadResult {
  desktopUrl: string;
  mobileUrl: string;
}

function uploadBuffer(
  buffer: Buffer,
  publicId: string,
  hash: string,
  tenantId: string,
  tenantSlug: string,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        format: "jpg",
        quality: 85,
        transformation: [{ width, height, crop: "fill" }],
        context: `hash=${hash}|tenantId=${tenantId}`,
        tags: ["screenshot", tenantSlug],
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary returned no result"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

export async function uploadScreenshots(
  tenantId: string,
  tenantSlug: string,
  desktopBuffer: Buffer,
  mobileBuffer: Buffer,
  hash: string,
): Promise<UploadResult> {
  const [desktopUrl, mobileUrl] = await Promise.all([
    uploadBuffer(
      desktopBuffer,
      `hospitality/${tenantSlug}/screenshots/desktop`,
      hash, tenantId, tenantSlug, 1440, 900,
    ),
    uploadBuffer(
      mobileBuffer,
      `hospitality/${tenantSlug}/screenshots/mobile`,
      hash, tenantId, tenantSlug, 390, 844,
    ),
  ]);

  log("info", "screenshot.uploaded", { tenantId, desktopUrl, mobileUrl });

  return { desktopUrl, mobileUrl };
}
