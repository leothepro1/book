import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function syncOrg() {
  const clerkOrgId = process.argv[2];
  const name = process.argv[3];
  const slug = process.argv[4];
  const ownerClerkUserId = process.argv[5];

  if (!clerkOrgId || !name || !slug) {
    console.error("Usage: tsx scripts/sync-clerk-org.ts <clerkOrgId> <name> <slug> [ownerClerkUserId]");
    process.exit(1);
  }

  // Skapa tenant kopplad till Clerk Organization
  const tenant = await prisma.tenant.upsert({
    where: { clerkOrgId },
    update: { name },
    create: {
      clerkOrgId,
      name,
      slug,
      ownerClerkUserId: ownerClerkUserId || null,
      settings: {
        property: {
          name,
          address: "Apelviksvägen 47, 439 76 Kungsbacka",
          latitude: 57.4875,
          longitude: 12.0739,
          checkInTime: "14:00",
          checkOutTime: "11:00",
          timezone: "Europe/Stockholm",
        },
        theme: {
          version: 1,
          colors: {
            background: "#fff",
            text: "#2D2C2B",
            buttonBg: "#8B3DFF",
            buttonText: "#fff",
          },
          header: { logoUrl: undefined, logoWidth: 120 },
          background: { mode: "fill" },
          buttons: { variant: "solid", radius: "rounder", shadow: "soft" },
          typography: { headingFont: "inter", bodyFont: "inter", mutedOpacity: 0.72 },
        },
        supportLinks: {
          supportUrl: "https://apelviken.se/support",
          faqUrl: "https://apelviken.se/faq",
          termsUrl: "https://apelviken.se/vistelsevillkor",
        },
        features: {
          commerceEnabled: false,
          accountEnabled: false,
          notificationsEnabled: true,
          languageSwitcherEnabled: true,
        },
      },
    },
  });

  console.log("✅ Tenant synced to database:");
  console.log("Tenant ID:", tenant.id);
  console.log("Name:", tenant.name);
  console.log("Slug:", tenant.slug);
  console.log("Clerk Org ID:", tenant.clerkOrgId);
}

syncOrg()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
