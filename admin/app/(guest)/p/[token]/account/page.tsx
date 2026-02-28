import { prisma } from "@/app/_lib/db/prisma";
import { getTenantConfig } from "../../../_lib/tenant";
import AccountClient from "./AccountClient";


export const dynamic = "force-dynamic";

type Lang = "sv" | "en";

export default async function Page(props: {
  params: Promise<{ token?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const searchParams = (await props.searchParams) ?? {};

  const token = params?.token;
  const lang = (searchParams?.lang === "en" ? "en" : "sv") as Lang;

  // BETATEST: /p/test/account => senaste bokningen
  if (token === "test") {
    const latestBooking = await prisma.booking.findFirst({
      orderBy: { createdAt: "desc" },
      include: { tenant: true },
    });

    if (!latestBooking) {
      return (
        <div style={{ padding: 20, color: "var(--text)" }}>
          {lang === "en" ? "No booking found." : "Ingen bokning hittades."}
        </div>
      );
    }

    const config = await getTenantConfig(latestBooking.tenantId ?? "default");

    const allBookings = await prisma.booking.findMany({
      where: {
        tenantId: latestBooking.tenantId,
        guestEmail: latestBooking.guestEmail,
      },
      orderBy: { arrival: "desc" },
    });

    const latest = allBookings[0] ?? latestBooking;

    return (
      <AccountClient
        token={latestBooking.id}
        tenantId={latestBooking.tenantId}
        guestEmail={latestBooking.guestEmail}
        lang={lang}
        config={config}
        initial={{
          firstName: latest.firstName ?? "",
          lastName: latest.lastName ?? "",
          guestEmail: latest.guestEmail ?? "",
          phone: latest.phone ?? "",
          street: latest.street ?? "",
          postalCode: latest.postalCode ?? "",
          city: latest.city ?? "",
          country: latest.country ?? "",
        }}
      />
    );
  }

  // 1) MagicLink.token -> Booking
  const magic = token
    ? await prisma.magicLink.findUnique({
        where: { token },
        include: { booking: { include: { tenant: true } } },
      })
    : null;

  const bookingFromMagic = magic?.booking ?? null;

  // 2) Fallback: token som Booking.id
  const bookingFromId =
    !bookingFromMagic && token
      ? await prisma.booking.findUnique({
          where: { id: token },
          include: { tenant: true },
        })
      : null;

  const booking = bookingFromMagic ?? bookingFromId;

  if (!booking) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        {lang === "en" ? "No booking found." : "Ingen bokning hittades."}
      </div>
    );
  }

  const config = await getTenantConfig(booking.tenantId ?? "default");

  const allBookings = await prisma.booking.findMany({
    where: {
      tenantId: booking.tenantId,
      guestEmail: booking.guestEmail,
    },
    orderBy: { arrival: "desc" },
  });

  const latest = allBookings[0] ?? booking;

  return (
    <AccountClient
      token={booking.id}
      tenantId={booking.tenantId}
      guestEmail={booking.guestEmail}
      lang={lang}
      config={config}
      initial={{
        firstName: latest.firstName ?? "",
        lastName: latest.lastName ?? "",
        guestEmail: latest.guestEmail ?? "",
        phone: latest.phone ?? "",
        street: latest.street ?? "",
        postalCode: latest.postalCode ?? "",
        city: latest.city ?? "",
        country: latest.country ?? "",
      }}
    />
  );
}
