import { prisma } from "../../../../_lib/db/prisma";
import { getTenantConfig } from "../../../_lib/tenant";
import AccountClient from "./AccountClient";
import { createGlobalMockBooking } from "@/app/_lib/mockData";
import { auth } from "@clerk/nextjs/server";

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

  console.log("[ACCOUNT PAGE] Token received:", token);
  // PREVIEW or TEST MODE: Use global mock booking
  if (token === "preview" || token === "test") {
    let tenant = null;
  console.log("[ACCOUNT PAGE] Entering preview/test mode");
    
    // Try to get tenant from auth (for preview mode)
    try {
      let userId: string | null = null; let orgId: string | null = null; try { const a = await auth(); userId = a.userId ?? null; orgId = a.orgId ?? null; } catch {}
      if (userId && orgId) {
        tenant = await prisma.tenant.findUnique({
          where: { clerkOrgId: orgId },
        });
      }
    } catch (error) {
      // Auth failed - OK for /p/test
    }
    
    // Fallback: use first tenant (for /p/test without auth)
    if (!tenant) {
      tenant = await prisma.tenant.findFirst();
    }

    if (tenant) {
      const mockBooking = createGlobalMockBooking(tenant.id);
      const config = await getTenantConfig(tenant.id);

      return (
        <AccountClient
          token={token}
          tenantId={tenant.id}
          guestEmail={mockBooking.guestEmail!}
          lang={lang}
          config={config}
          initial={{
            firstName: mockBooking.firstName ?? "",
            lastName: mockBooking.lastName ?? "",
            guestEmail: mockBooking.guestEmail ?? "",
            phone: mockBooking.phone ?? "",
            street: mockBooking.street ?? "",
            postalCode: mockBooking.postalCode ?? "",
            city: mockBooking.city ?? "",
            country: mockBooking.country ?? "",
          }}
        />
      );
    }
  }

  // NORMAL FLOW: Real bookings
  // 1) MagicLink.token -> Booking
  const magic = token
    ? await prisma.magicLink.findUnique({
        where: { token },
        include: { booking: { include: { tenant: true } } },
      })
    : null;

  const bookingFromMagic = magic?.booking ?? null;

  // 2) Fallback: token as Booking.id
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
