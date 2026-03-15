import { prisma } from "../../../../_lib/db/prisma";
import { getTenantConfig } from "../../../_lib/tenant";
import AccountClient from "./AccountClient";
import { createGlobalMockBooking } from "@/app/_lib/mockData";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";

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
      const { userId, orgId } = await getAuth();
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

  // Use adapter to get guest profile data
  let initial = {
    firstName: booking.firstName ?? "",
    lastName: booking.lastName ?? "",
    guestEmail: booking.guestEmail ?? "",
    phone: booking.phone ?? "",
    street: booking.street ?? "",
    postalCode: booking.postalCode ?? "",
    city: booking.city ?? "",
    country: booking.country ?? "",
  };

  try {
    const adapter = await resolveAdapter(booking.tenantId);
    const guest = await adapter.getGuest(booking.tenantId, booking.guestEmail);
    if (guest) {
      initial = {
        firstName: guest.firstName,
        lastName: guest.lastName,
        guestEmail: guest.email,
        phone: guest.phone ?? "",
        street: guest.address.street ?? "",
        postalCode: guest.address.postalCode ?? "",
        city: guest.address.city ?? "",
        country: guest.address.country ?? "",
      };
    }
  } catch (error) {
    console.error("[ACCOUNT PAGE] Adapter error, using resolved booking:", error);
  }

  return (
    <AccountClient
      token={booking.id}
      tenantId={booking.tenantId}
      guestEmail={booking.guestEmail}
      lang={lang}
      config={config}
      initial={initial}
    />
  );
}
