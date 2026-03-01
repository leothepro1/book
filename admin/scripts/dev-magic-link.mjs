import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const bookingIdArg = process.argv[2]; // optional

async function main() {
  const booking = bookingIdArg
    ? await prisma.booking.findUnique({ where: { id: bookingIdArg } })
    : await prisma.booking.findFirst({ orderBy: { createdAt: "desc" } });

  if (!booking) {
    console.error("No booking found.");
    process.exit(1);
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min

  await prisma.magicLink.create({
    data: { token, bookingId: booking.id, expiresAt },
  });

  console.log("Booking:", booking.id);
  console.log("Magic token:", token);
  console.log("URL:", `/p/${token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
