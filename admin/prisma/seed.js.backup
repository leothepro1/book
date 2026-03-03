const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "apelviken" },
    update: { name: "Apelviken Camping" },
    create: { name: "Apelviken Camping", slug: "apelviken" },
  });

  // Exempel: skapa en test-booking bara om den inte redan finns
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
          bookingNumber: "TESTBOOKING01",
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
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });