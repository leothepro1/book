const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.create({
    data: {
      name: "Apelviken Camping",
      slug: "apelviken",
    },
  });

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

      arrival: new Date("2026-06-01T15:00:00Z"),
      departure: new Date("2026-06-05T10:00:00Z"),
      unit: "A12",
      status: "booked",
    },
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
