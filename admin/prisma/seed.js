const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 1. Skapa/uppdatera Apelviken tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "apelviken" },
    update: { 
      name: "Apelviken Camping",
      settings: {
        property: {
          name: "Apelviken Camping",
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
          header: {
            logoUrl: undefined,
            logoWidth: 120,
          },
          background: {
            mode: "fill",
          },
          buttons: {
            variant: "solid",
            radius: "rounder",
            shadow: "soft",
          },
          typography: {
            headingFont: "inter",
            bodyFont: "inter",
            mutedOpacity: 0.72,
          },
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
    create: { 
      name: "Apelviken Camping", 
      slug: "apelviken",
      settings: {
        property: {
          name: "Apelviken Camping",
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
          header: {
            logoUrl: undefined,
            logoWidth: 120,
          },
          background: {
            mode: "fill",
          },
          buttons: {
            variant: "solid",
            radius: "rounder",
            shadow: "soft",
          },
          typography: {
            headingFont: "inter",
            bodyFont: "inter",
            mutedOpacity: 0.72,
          },
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

  console.log("✅ Tenant:", tenant.name);

  // 2. Skapa default admin user (simulerar Clerk user)
  // När Clerk är installerat kommer detta synkas via webhook istället
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@apelviken.se" },
    update: {},
    create: {
      clerkId: "dev_clerk_id_admin", // Placeholder - ersätts av riktig Clerk ID senare
      email: "admin@apelviken.se",
      firstName: "Admin",
      lastName: "User",
    },
  });

  console.log("✅ Admin user:", adminUser.email);

  // 3. Koppla admin till tenant som OWNER
  const membership = await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: adminUser.id,
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      tenantId: tenant.id,
      role: "OWNER",
    },
  });

  console.log("✅ Tenant membership created");

  // 4. Skapa test-booking (som tidigare)
  const existing = await prisma.booking.findFirst({
    where: {
      tenantId: tenant.id,
      guestEmail: "test@exempel.se",
      arrival: new Date("2026-06-01T15:00:00.000Z"),
    },
  });

  if (!existing) {
    await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        firstName: "Test",
        lastName: "Gäst",
        guestEmail: "test@exempel.se",
        phone: "+46700000000",
        street: "Storgatan 1",
        postalCode: "43244",
        city: "Varberg",
        country: "Sweden",
        arrival: new Date("2026-06-01T15:00:00.000Z"),
        departure: new Date("2026-06-05T10:00:00.000Z"),
        unit: "A12",
        status: "PRE_CHECKIN",
      },
    });
    console.log("✅ Test booking created");
  } else {
    console.log("ℹ️  Test booking already exists");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
