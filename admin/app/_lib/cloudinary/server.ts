import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key:    process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

export { cloudinary };

export type CloudinaryUploadResult = {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  resource_type: string;
};

/**
 * Generate a signed video thumbnail URL (first frame as JPG).
 * Needed because strict transformations are enabled — unsigned transform URLs return 401.
 */
export function getSignedVideoThumbUrl(
  publicId: string,
  options: { width?: number; height?: number } = {}
): string {
  const { width = 400, height = 300 } = options;
  return cloudinary.url(publicId, {
    secure: true,
    sign_url: true,
    resource_type: "video",
    format: "jpg",
    transformation: [
      { start_offset: "0", width, height, crop: "fill" },
    ],
  });
}

export function getOptimizedUrl(
  publicId: string,
  options: {
    width?: number;
    height?: number;
    quality?: "auto" | number;
    format?: "auto" | "webp" | "avif";
    crop?: "fill" | "fit" | "scale" | "thumb";
  } = {}
): string {
  const { width, height, quality = "auto", format = "auto", crop = "fill" } = options;
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [
      {
        ...(width && { width }),
        ...(height && { height }),
        ...(crop && { crop }),
        quality,
        fetch_format: format,
      },
    ],
  });
}
