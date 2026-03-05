import {
  buildCloudinaryUrl,
  isCloudinaryUrl,
  extractPublicId,
} from "@/app/_lib/cloudinary/client";

export type CardImageSize =
  | "classic"    // 1:1 thumbnail, small
  | "featured"   // 5:4 hero, large
  | "showcase"   // 5:4 hero, large
  | "grid"       // 4:3 medium
  | "slider";    // 3:2 wide

const SIZE_MAP: Record<CardImageSize, { width: number; height: number; crop: "fill" | "fit" }> = {
  classic:  { width: 120,  height: 120,  crop: "fill" },
  featured: { width: 800,  height: 640,  crop: "fill" },
  showcase: { width: 800,  height: 640,  crop: "fill" },
  grid:     { width: 600,  height: 450,  crop: "fill" },
  slider:   { width: 700,  height: 467,  crop: "fill" },
};

/**
 * Returns an optimized image URL for a card.
 * - Cloudinary URLs: transformed with correct dimensions, auto format + quality
 * - External URLs: returned as-is (no transformation possible)
 */
export function cardImageUrl(
  url: string | undefined,
  size: CardImageSize
): string | undefined {
  if (!url) return undefined;

  if (isCloudinaryUrl(url)) {
    const publicId = extractPublicId(url);
    const { width, height, crop } = SIZE_MAP[size];
    return buildCloudinaryUrl(publicId, {
      width,
      height,
      crop,
      quality: "auto",
      format: "auto",
    });
  }

  // Non-Cloudinary URL — return as-is
  return url;
}
