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
      clerkOrgId: "seed_apelviken_org",
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

  // 5. System-default PaymentTerms (tenantId = NULL).
  // Idempotent: keyed on (name) among rows where tenantId IS NULL.
  // Prisma upsert requires a compound unique constraint; we cannot use @@unique with a
  // nullable tenantId (Postgres treats NULLs as distinct), so the DB-level uniqueness is
  // enforced by a partial unique index (see migration). Seed mirrors that with findFirst +
  // update/create.
  const systemPaymentTerms = [
    { name: "Förfaller vid mottagning",   type: "DUE_ON_RECEIPT",     netDays: null },
    { name: "Förfaller vid incheckning",  type: "DUE_ON_FULFILLMENT", netDays: null },
    { name: "Netto 7 dagar",              type: "NET",                netDays: 7   },
    { name: "Netto 15 dagar",             type: "NET",                netDays: 15  },
    { name: "Netto 30 dagar",             type: "NET",                netDays: 30  },
    { name: "Netto 45 dagar",             type: "NET",                netDays: 45  },
    { name: "Netto 60 dagar",             type: "NET",                netDays: 60  },
    { name: "Netto 90 dagar",             type: "NET",                netDays: 90  },
  ];

  for (const terms of systemPaymentTerms) {
    const existingTerms = await prisma.paymentTerms.findFirst({
      where: { tenantId: null, name: terms.name },
    });
    if (existingTerms) {
      await prisma.paymentTerms.update({
        where: { id: existingTerms.id },
        data: { type: terms.type, netDays: terms.netDays },
      });
    } else {
      await prisma.paymentTerms.create({
        data: {
          tenantId: null,
          name: terms.name,
          type: terms.type,
          netDays: terms.netDays,
        },
      });
    }
  }
  console.log(`✅ ${systemPaymentTerms.length} system-default PaymentTerms upserted`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
