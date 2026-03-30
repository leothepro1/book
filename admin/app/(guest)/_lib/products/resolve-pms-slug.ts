/**
 * Resolve Accommodation Slug by External ID
 * ══════════════════════════════════════════
 *
 * Looks up an Accommodation by externalId and returns its slug.
 * Uses React cache() for deduplication within a single render pass.
 *
 * Replaces the old resolvePmsProductSlug() which queried the Product model.
 */

import { cache } from "react";
import { prisma } from "@/app/_lib/db/prisma";

/**
 * Look up the slug for an Accommodation by its PMS external source ID.
 * Returns null if no accommodation found (not yet synced).
 * Safe to call multiple times per render — cached.
 */
export const resolveAccommodationSlugByExternalId = cache(
  async (tenantId: string, externalId: string): Promise<string | null> => {
    const accommodation = await prisma.accommodation.findFirst({
      where: {
        tenantId,
        externalId,
        archivedAt: null,
      },
      select: { slug: true },
    });
    return accommodation?.slug ?? null;
  },
);
