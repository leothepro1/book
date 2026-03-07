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
