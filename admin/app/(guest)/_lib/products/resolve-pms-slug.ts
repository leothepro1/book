/**
 * Resolve PMS Product Slug
 * ════════════════════════
 *
 * Looks up a Product by pmsSourceId and returns its slug.
 * Uses React cache() for deduplication within a single render pass.
 */

import { cache } from "react";
import { prisma } from "@/app/_lib/db/prisma";

/**
 * Look up the slug for a PMS product by its external source ID.
 * Returns null if no product found (not yet synced).
 * Safe to call multiple times per render — cached.
 */
export const resolvePmsProductSlug = cache(
  async (tenantId: string, pmsSourceId: string): Promise<string | null> => {
    const product = await prisma.product.findFirst({
      where: {
        tenantId,
        pmsSourceId,
        pmsProvider: { not: null },
        productType: "PMS_ACCOMMODATION",
      },
      select: { slug: true },
    });
    return product?.slug ?? null;
  },
);
