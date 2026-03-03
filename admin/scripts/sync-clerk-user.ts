import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function syncUser() {
  const clerkId = process.argv[2];
  const email = process.argv[3];
  const firstName = process.argv[4] || "";
  const lastName = process.argv[5] || "";

  if (!clerkId || !email) {
    console.error("Usage: tsx scripts/sync-clerk-user.ts <clerkId> <email> [firstName] [lastName]");
    process.exit(1);
  }

  // 1. Skapa/uppdatera user
  const user = await prisma.user.upsert({
    where: { email },
    update: { clerkId, firstName, lastName },
    create: { clerkId, email, firstName, lastName },
  });

  console.log("✅ User synced:", user.email);

  // 2. Koppla till Apelviken tenant som OWNER
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "apelviken" },
  });

  if (!tenant) {
    console.error("❌ Apelviken tenant not found");
    process.exit(1);
  }

  const membership = await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: "OWNER",
    },
  });

  console.log("✅ Tenant membership created");
  console.log("User ID:", user.id);
  console.log("Tenant:", tenant.name);
  console.log("Role:", membership.role);
}

syncUser()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
