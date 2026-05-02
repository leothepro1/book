/**
 * Sync accommodations from the connected PMS into the dev tenant's
 * Accommodation / AccommodationCategory tables.
 *
 * Invoked as a sub-step of `npm run db:seed` (see prisma/seed.js).
 * Standalone runnable too: `npx tsx scripts/sync-dev-accommodations.ts`
 *
 * Resolves the dev tenant via DEV_ORG_ID. Skips silently when the
 * tenant has no PMS integration — bare dev setups stay clean.
 */

import { PrismaClient } from "@prisma/client";
import { syncAccommodations } from "../app/_lib/accommodations";

const prisma = new PrismaClient();

async function main() {
  const devOrgId = process.env.DEV_ORG_ID;
  if (!devOrgId) {
    console.error("[sync-dev-accommodations] DEV_ORG_ID required");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: devOrgId },
    include: { integration: true },
  });

  if (!tenant) {
    console.log(`ℹ️  No tenant for DEV_ORG_ID=${devOrgId} — skipping PMS sync`);
    return;
  }
  if (!tenant.integration || tenant.integration.status !== "active") {
    console.log("ℹ️  No active PMS integration — skipping PMS sync");
    return;
  }

  console.log(`▸ Syncing accommodations from ${tenant.integration.provider} for "${tenant.name}"...`);
  const result = await syncAccommodations(tenant.id);
  console.log(
    `✅ Accommodations synced: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.skipped} skipped, ${result.errors.length} errors`,
  );
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error("  ✗", e);
  }
}

main()
  .catch((err) => {
    console.error("[sync-dev-accommodations] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
