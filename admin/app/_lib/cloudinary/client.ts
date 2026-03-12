const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;

export function buildCloudinaryUrl(
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
  const transforms: string[] = [];
  if (width)  transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  transforms.push(`c_${crop}`);
  transforms.push(`q_${quality}`);
  transforms.push(`f_${format}`);
  const t = transforms.join(",");
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${t}/${publicId}`;
}

/**
 * Build an optimized Cloudinary video URL.
 * Uses q_auto for quality, f_auto for format negotiation (WebM/MP4).
 */
export function buildCloudinaryVideoUrl(
  publicId: string,
  options: {
    width?: number;
    height?: number;
    quality?: "auto" | number;
    crop?: "fill" | "fit" | "scale" | "limit";
  } = {}
): string {
  const { width, height, quality = "auto", crop = "limit" } = options;
  const transforms: string[] = [];
  if (width)  transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  transforms.push(`c_${crop}`);
  transforms.push(`q_${quality}`);
  transforms.push("f_auto");
  const t = transforms.join(",");
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${t}/${publicId}`;
}

/**
 * Build a Cloudinary video poster/thumbnail URL (first frame as JPG).
 */
export function buildCloudinaryVideoPoster(
  publicId: string,
  options: { width?: number; height?: number } = {}
): string {
  const { width = 800, height } = options;
  const transforms: string[] = ["so_0"];
  transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  transforms.push("c_limit", "q_auto", "f_jpg");
  const t = transforms.join(",");
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${t}/${publicId}`;
}

export function isCloudinaryUrl(url: string): boolean {
  return url.includes("res.cloudinary.com");
}

export function extractPublicId(cloudinaryUrl: string): string {
  // Strip everything up to and including /upload/, then remove version prefix (v123...)
  // and file extension, keeping folder paths intact (e.g. "cards/abc123")
  const afterUpload = cloudinaryUrl.split("/upload/")[1];
  if (!afterUpload) return cloudinaryUrl;

  // Remove leading version segment (v followed by digits)
  const withoutVersion = afterUpload.replace(/^v\d+\//, "");

  // Remove file extension
  return withoutVersion.replace(/\.[^.]+$/, "");
}
