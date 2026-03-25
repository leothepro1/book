/**
 * Gift Card Rendered Image Upload
 * ════════════════════════════════
 *
 * Uploads a pre-rendered gift card PNG to Cloudinary.
 * Returns the secure URL for use in emails and admin UI.
 */

import { uploadToCloudinary } from "@/app/_lib/media/cloudinary-service";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

/**
 * Upload a rendered gift card PNG and store the URL on the design.
 *
 * @param tenantId - Tenant for folder structure
 * @param designId - GiftCardDesign to update
 * @param pngBuffer - The rendered PNG buffer
 * @returns The Cloudinary secure_url
 */
export async function uploadRenderedDesign(
  tenantId: string,
  designId: string,
  pngBuffer: Buffer,
): Promise<string> {
  // Get tenant slug for folder path
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { portalSlug: true, slug: true },
  });

  const slug = tenant?.portalSlug ?? tenant?.slug ?? tenantId;
  const folder = `hospitality/${slug}/gift-cards`;

  const result = await uploadToCloudinary(pngBuffer, {
    folder,
    tags: ["gift-card", designId],
  });

  // Update design with rendered URL
  await prisma.giftCardDesign.update({
    where: { id: designId },
    data: { renderedImageUrl: result.secure_url },
  });

  log("info", "gift-card.design-rendered", {
    designId,
    tenantId,
    url: result.secure_url,
    bytes: result.bytes,
  });

  return result.secure_url;
}
