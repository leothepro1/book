import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId: "cmn342lxz00006yknxx90px3v" },
    select: {
      id: true,
      name: true,
      nameOverride: true,
      slug: true,
      externalId: true,
      status: true,
      archivedAt: true,
      categoryItems: {
        select: { categoryId: true, category: { select: { title: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  let withCategories = 0;
  let withoutCategories = 0;

  for (const acc of accommodations) {
    const display = acc.nameOverride ?? acc.name;
    const archived = acc.archivedAt ? " [ARCHIVED]" : "";
    const status = acc.status !== "ACTIVE" ? ` [${acc.status}]` : "";

    console.log({
      name: `${display}${archived}${status}`,
      categoryItemCount: acc.categoryItems.length,
      categories: acc.categoryItems.map((ci) => ci.category.title),
      hasCategoryItems: acc.categoryItems.length > 0,
    });

    if (acc.categoryItems.length > 0) withCategories++;
    else withoutCategories++;
  }

  console.log("\n══════════════════════════════════════");
  console.log(`Total accommodations:     ${accommodations.length}`);
  console.log(`With categoryItems (1+):  ${withCategories}`);
  console.log(`Without categoryItems (0): ${withoutCategories}`);
  console.log("══════════════════════════════════════");

  if (withoutCategories > 0) {
    console.log("\nAccommodations missing categoryItems:");
    for (const acc of accommodations) {
      if (acc.categoryItems.length === 0) {
        const display = acc.nameOverride ?? acc.name;
        console.log(
          `  - "${display}" (id: ${acc.id}, slug: ${acc.slug}, externalId: ${acc.externalId}, status: ${acc.status}, archived: ${!!acc.archivedAt})`,
        );
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
