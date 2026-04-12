import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Check the accommodation type of Stuga 1-6
  const stuga = await prisma.accommodation.findUnique({
    where: { id: "cmnq8ca7500118cdfaujkohcn" },
    select: { name: true, accommodationType: true, externalId: true },
  });
  console.log("Stuga 1-6 personer:", stuga);

  // Check all categories and their pmsRef values
  const categories = await prisma.accommodationCategory.findMany({
    where: { tenantId: "cmn342lxz00006yknxx90px3v" },
    select: { id: true, title: true, pmsRef: true, status: true },
  });
  console.log("\nAccommodationCategories:");
  for (const c of categories) {
    console.log(`  "${c.title}" id: ${c.id} pmsRef: ${c.pmsRef} status: ${c.status}`);
  }

  // Check all unique accommodationType values in the tenant
  const types = await prisma.accommodation.groupBy({
    by: ["accommodationType"],
    where: { tenantId: "cmn342lxz00006yknxx90px3v" },
    _count: true,
  });
  console.log("\nAccommodation types in use:");
  for (const t of types) {
    console.log(`  ${t.accommodationType}: ${t._count} accommodations`);
  }

  // Check which accommodations have a type with no matching category pmsRef
  const pmsRefs = new Set(categories.map(c => c.pmsRef).filter(Boolean));
  const mismatches = await prisma.accommodation.findMany({
    where: { tenantId: "cmn342lxz00006yknxx90px3v", archivedAt: null },
    select: { id: true, name: true, accommodationType: true },
  });

  console.log("\nType → pmsRef mismatches:");
  for (const acc of mismatches) {
    if (!pmsRefs.has(acc.accommodationType)) {
      console.log(`  ⚠ "${acc.name}" has type ${acc.accommodationType} — no category with pmsRef="${acc.accommodationType}" exists`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
