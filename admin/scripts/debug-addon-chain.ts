/**
 * Debug: dump accommodation → categoryItems → AccommodationCategoryAddon chain
 * Run: npx tsx scripts/debug-addon-chain.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const accommodations = await prisma.accommodation.findMany({
    where: { archivedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      nameOverride: true,
      slug: true,
      externalId: true,
      tenantId: true,
      categoryItems: {
        select: {
          categoryId: true,
          category: {
            select: {
              id: true,
              title: true,
              status: true,
              visibleInSearch: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const acc of accommodations) {
    const displayName = acc.nameOverride ?? acc.name;
    console.log(`\n${"═".repeat(70)}`);
    console.log(`Accommodation: ${displayName}`);
    console.log(`  id:         ${acc.id}`);
    console.log(`  slug:       ${acc.slug}`);
    console.log(`  externalId: ${acc.externalId}`);
    console.log(`  tenantId:   ${acc.tenantId}`);

    const categoryIds = acc.categoryItems.map((ci) => ci.categoryId);
    console.log(`\n  categoryItems (${acc.categoryItems.length}):`);
    if (acc.categoryItems.length === 0) {
      console.log(`    ⚠ NONE — addonLinks query will return 0 results`);
    }
    for (const ci of acc.categoryItems) {
      console.log(
        `    categoryId: ${ci.categoryId}  title: ${ci.category.title ?? "(null)"}  status: ${ci.category.status}  visibleInSearch: ${ci.category.visibleInSearch}`,
      );
    }

    if (categoryIds.length === 0) continue;

    // Same query as session/route.ts lines 210–226
    const addonLinks = await prisma.accommodationCategoryAddon.findMany({
      where: { categoryId: { in: categoryIds } },
      select: {
        id: true,
        categoryId: true,
        sortOrder: true,
        collection: {
          select: {
            id: true,
            title: true,
            status: true,
            items: {
              where: {
                product: { status: "ACTIVE", archivedAt: null },
              },
              select: {
                id: true,
                product: {
                  select: { id: true, title: true, status: true },
                },
              },
            },
          },
        },
      },
    });

    const activeLinks = addonLinks.filter(
      (link) =>
        link.collection.status === "ACTIVE" &&
        link.collection.items.length > 0,
    );

    console.log(
      `\n  AccommodationCategoryAddon links (${addonLinks.length} total, ${activeLinks.length} active with products):`,
    );
    for (const link of addonLinks) {
      const active =
        link.collection.status === "ACTIVE" &&
        link.collection.items.length > 0;
      console.log(
        `    [${active ? "✓" : "✗"}] categoryId: ${link.categoryId}  collection: "${link.collection.title}" (${link.collection.status})  products: ${link.collection.items.length}  sortOrder: ${link.sortOrder}`,
      );
      for (const item of link.collection.items) {
        console.log(
          `        product: "${item.product.title}" (${item.product.status}) id: ${item.product.id}`,
        );
      }
    }

    console.log(
      `\n  → hasAddons = ${activeLinks.length > 0}  (session would get status: ${activeLinks.length > 0 ? "PENDING → addons page" : "CHECKOUT → direct to payment"})`,
    );

    // Check spot maps too
    const spotMaps = await prisma.spotMap.findMany({
      where: {
        isActive: true,
        accommodationItems: { some: { accommodationId: acc.id } },
      },
      select: {
        id: true,
        title: true,
        _count: { select: { markers: true } },
      },
    });

    if (spotMaps.length > 0) {
      console.log(`\n  SpotMaps (${spotMaps.length}):`);
      for (const sm of spotMaps) {
        console.log(
          `    "${sm.title}" id: ${sm.id}  markers: ${sm._count.markers}`,
        );
      }
    }
  }

  console.log(`\n${"═".repeat(70)}\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
