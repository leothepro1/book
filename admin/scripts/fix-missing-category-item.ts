import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1. Confirm what category "Stuga 1-4 personer" and "Campingstuga" use
  const siblings = await prisma.accommodation.findMany({
    where: {
      tenantId: "cmn342lxz00006yknxx90px3v",
      slug: { in: ["stuga-1-4-personer", "campingstuga-1"] },
    },
    select: {
      name: true,
      slug: true,
      categoryItems: {
        select: { categoryId: true, category: { select: { title: true } } },
      },
    },
  });

  console.log("Sibling accommodations:");
  for (const s of siblings) {
    console.log(`  ${s.name} (${s.slug}): ${s.categoryItems.map(ci => `${ci.category.title} (${ci.categoryId})`).join(", ")}`);
  }

  // Both should be "Hotell" category
  const targetCategoryId = siblings[0]?.categoryItems[0]?.categoryId;
  if (!targetCategoryId) {
    console.error("Could not determine target category from siblings");
    return;
  }

  console.log(`\nTarget category: ${targetCategoryId}`);

  // 2. Check if link already exists (idempotent)
  const targetAccId = "cmnq8ca7500118cdfaujkohcn"; // Stuga 1-6 personer
  const existing = await prisma.accommodationCategoryItem.findFirst({
    where: { accommodationId: targetAccId, categoryId: targetCategoryId },
  });

  if (existing) {
    console.log("Link already exists — nothing to do.");
    return;
  }

  // 3. Create the link
  const created = await prisma.accommodationCategoryItem.create({
    data: {
      accommodationId: targetAccId,
      categoryId: targetCategoryId,
    },
  });

  console.log(`\nCreated AccommodationCategoryItem: ${created.id}`);
  console.log(`  accommodationId: ${targetAccId} (Stuga 1-6 personer)`);
  console.log(`  categoryId: ${targetCategoryId}`);

  // 4. Verify
  const verified = await prisma.accommodation.findUnique({
    where: { id: targetAccId },
    select: {
      name: true,
      categoryItems: {
        select: { categoryId: true, category: { select: { title: true } } },
      },
    },
  });

  console.log(`\nVerification:`);
  console.log(`  ${verified?.name}: ${verified?.categoryItems.map(ci => ci.category.title).join(", ")}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
