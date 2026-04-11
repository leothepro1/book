/**
 * Seed AccommodationUnit rows for development.
 *
 * Creates 5–8 realistic unit rows per Accommodation for the dev tenant.
 * Safe to run multiple times — uses upsert on @@unique([tenantId, accommodationId, name]).
 *
 * Usage:
 *   source .env.local && node prisma/seeds/seed-accommodation-units.js
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

// ── Unit name patterns per accommodation type ─────────────────────

const UNIT_PATTERNS = {
  CAMPING: {
    prefix: "",
    names: ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5", "C1", "C2", "C3"],
  },
  HOTEL: {
    prefix: "Rum ",
    names: ["101", "102", "103", "104", "105", "201", "202", "203"],
  },
  CABIN: {
    prefix: "Stuga ",
    names: ["1", "2", "3", "4", "5", "6", "7", "8"],
  },
  APARTMENT: {
    prefix: "Lgh ",
    names: ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B"],
  },
  PITCH: {
    prefix: "Plats ",
    names: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
};

function getUnitNames(accommodationType, accommodationName) {
  const pattern = UNIT_PATTERNS[accommodationType] || UNIT_PATTERNS.CAMPING;

  // Use a hash of the accommodation name to pick a consistent subset
  let hash = 0;
  for (let i = 0; i < accommodationName.length; i++) {
    hash = ((hash << 5) - hash + accommodationName.charCodeAt(i)) | 0;
  }
  const count = 5 + (Math.abs(hash) % 4); // 5–8 units

  return pattern.names.slice(0, count).map((n) => pattern.prefix + n);
}

async function main() {
  // Resolve dev tenant via DEV_ORG_ID
  const devOrgId = process.env.DEV_ORG_ID;
  if (!devOrgId) {
    console.error("DEV_ORG_ID not set. Run: source .env.local && node prisma/seeds/seed-accommodation-units.js");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({
    where: { clerkOrgId: devOrgId },
    select: { id: true, name: true },
  });

  if (!tenant) {
    console.error(`No tenant found for DEV_ORG_ID=${devOrgId}`);
    process.exit(1);
  }

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId: tenant.id, archivedAt: null },
    select: { id: true, name: true, accommodationType: true },
    orderBy: { name: "asc" },
  });

  if (accommodations.length === 0) {
    console.log("No accommodations found. Run a PMS sync first.");
    process.exit(0);
  }

  console.log(`Found ${accommodations.length} accommodations\n`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const acc of accommodations) {
    const unitNames = getUnitNames(acc.accommodationType, acc.name);
    let created = 0;
    let skipped = 0;

    for (const name of unitNames) {
      const result = await prisma.accommodationUnit.upsert({
        where: {
          tenantId_accommodationId_name: {
            tenantId: tenant.id,
            accommodationId: acc.id,
            name,
          },
        },
        create: {
          tenantId: tenant.id,
          accommodationId: acc.id,
          name,
          externalId: crypto.randomUUID(),
          status: "AVAILABLE",
        },
        update: {},
      });

      // If updatedAt === createdAt, it was just created
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        skipped++;
      }
    }

    totalCreated += created;
    totalSkipped += skipped;
    console.log(`  ${acc.name} (${acc.accommodationType}): ${created} created, ${skipped} existing`);
  }

  console.log(`\nDone: ${totalCreated} created, ${totalSkipped} already existed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
