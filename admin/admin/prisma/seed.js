const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "apelviken" },
    update: {},
    create: { name: "Apelviken Camping", slug: "apelviken" },
  });

  await prisma.booking.create({
    data: {
      tenantId: tenant.id,
      guestName: "Testgäst",
      guestEmail: "test@exempel.se",
      arrival: new Date("2026-06-01T15:00:00Z"),
      departure: new Date("2026-06-05T10:00:00Z"),
      unit: "A12",
      status: "booked",
    },
  });

  console.log("Seed klart: Tenant + Booking skapade");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });