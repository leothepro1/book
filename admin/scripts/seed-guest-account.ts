/**
 * Seed a GuestAccount for dev/demo.
 *
 * Usage: npx tsx scripts/seed-guest-account.ts
 *
 * Creates a GuestAccount for the demo email if it doesn't already exist.
 * Requires DATABASE_URL in .env.local (loaded by tsx automatically).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const EMAIL = "leo@pressify.se";
const prisma = new PrismaClient();

async function main() {
  const orgId = process.env.DEV_ORG_ID;
  if (!orgId) {
    console.error("DEV_ORG_ID is not set — cannot resolve tenant.");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true, name: true },
  });

  if (!tenant) {
    console.error(`No tenant found for DEV_ORG_ID=${orgId}`);
    process.exit(1);
  }

  const existing = await prisma.guestAccount.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: EMAIL } },
    select: { id: true },
  });

  if (existing) {
    console.log(`GuestAccount already exists for ${EMAIL} (id: ${existing.id})`);
    return;
  }

  const account = await prisma.guestAccount.create({
    data: {
      tenantId: tenant.id,
      email: EMAIL,
      verifiedEmail: true,
    },
  });

  console.log(`Created GuestAccount for ${EMAIL} (id: ${account.id}, tenant: ${tenant.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
