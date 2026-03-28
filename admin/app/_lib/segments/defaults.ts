/**
 * Default Segments — platform-created, not deletable.
 *
 * Seeded on tenant creation. Every new tenant starts with these
 * five segments — same as Shopify creates default customer segments.
 */

import type { Prisma } from "@prisma/client";

type PrismaTransactionClient = Parameters<Parameters<(typeof import("@/app/_lib/db/prisma"))["prisma"]["$transaction"]>[0]>[0];

export const DEFAULT_SEGMENTS: Array<{ name: string; query: string }> = [
  {
    name: "Alla gäster",
    query: "number_of_orders >= 0",
  },
  {
    name: "Återkommande gäster",
    query: "number_of_orders >= 2",
  },
  {
    name: "Gäster som inte bokat på 12 månader",
    query: "last_order_date < -12m",
  },
  {
    name: "Nyligen tillagda",
    query: "customer_added_date > -30d",
  },
  {
    name: "Marknadsföringsprenumeranter",
    query: "marketing_consent = true",
  },
];

/**
 * Seed default segments for a new tenant.
 * Idempotent — skips segments that already exist (by name + isDefault).
 * Must be called inside a transaction (uses tx client).
 */
export async function seedDefaultSegments(
  tenantId: string,
  tx: PrismaTransactionClient,
): Promise<void> {
  for (const seg of DEFAULT_SEGMENTS) {
    // Idempotent — skip if already exists
    const existing = await tx.guestSegment.findFirst({
      where: { tenantId, name: seg.name, isDefault: true },
      select: { id: true },
    });
    if (existing) continue;

    await tx.guestSegment.create({
      data: {
        tenantId,
        name: seg.name,
        query: seg.query,
        isDefault: true,
        createdBy: null, // system-created
      },
    });
  }
}
