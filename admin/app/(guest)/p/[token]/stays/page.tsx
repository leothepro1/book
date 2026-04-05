import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import GuestPageShell from "../../../_components/GuestPageShell";
import { getRequestLocale } from "../../../_lib/locale/getRequestLocale";
import { createMockNormalizedBookings } from "@/app/_lib/mockData";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { getBookingStatus } from "../../../_lib/booking";
import { ThemeRenderer } from "../../../_lib/themes";
import { BookingsProvider } from "../../../_components/sections";
import { prisma } from "../../../../_lib/db/prisma";
import type { NormalizedBooking } from "@/app/_lib/integrations/types";

export const dynamic = "force-dynamic";

/**
 * Split bookings into current (departure >= now) and previous (departure < now).
 */
function splitBookings(all: NormalizedBooking[]) {
  const now = new Date();
  return {
    currentBookings: all.filter((b) => new Date(b.departure) >= now),
    previousBookings: all.filter((b) => new Date(b.departure) < now),
  };
}

export default async function Page(props: {
  params: Promise<{ token?: string }>;
}) {
  const params = await props.params;
  const token = params?.token;
  const isPreview = token === "preview" || token === "test";

  // ── Preview / test mode ────────────────────────────────────
  // Real tokens are redirected by the parent layout before this page renders.
  if (isPreview) {
    let tenant = null;

    try {
      const { userId, orgId } = await getAuth();
      if (userId && orgId) {
        tenant = await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } });
      }
    } catch {
      // Auth failed — OK for /p/test
    }

    if (!tenant) {
      tenant = await prisma.tenant.findFirst();
    }

    if (!tenant) {
      return <div style={{ padding: 20, color: "var(--text)" }}>Ingen tenant hittades.</div>;
    }

    const locale = await getRequestLocale();
    const config = await getTenantConfig(tenant.id, { preferDraft: token === "preview", locale });
    const mockBooking = await resolveBookingFromToken(token);

    if (!mockBooking) {
      return <div style={{ padding: 20, color: "var(--text)" }}>Ingen bokning hittades.</div>;
    }

    const allMock = createMockNormalizedBookings(tenant.id);
    const { currentBookings, previousBookings } = splitBookings(allMock);
    const bookingStatus = getBookingStatus(mockBooking);

    return (
      <GuestPageShell config={config} pageId="stays">
        <BookingsProvider currentBookings={currentBookings} previousBookings={previousBookings}>
          <ThemeRenderer
            templateKey="stays"
            config={config}
            booking={mockBooking}
            bookingStatus={bookingStatus}
            token={token}
          />
        </BookingsProvider>
      </GuestPageShell>
    );
  }

  // ── Normal flow: real bookings via adapter ──────────────────
  const booking = await resolveBookingFromToken(token);

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen bokning hittades.</div>;
  }

  const locale = await getRequestLocale();
  const config = await getTenantConfig(booking.tenantId, { locale });
  const bookingStatus = getBookingStatus(booking);

  // Booking engine: no PMS sync — show booking from local DB only
  const allBookings: NormalizedBooking[] = booking ? [booking] : [];

  const { currentBookings, previousBookings } = splitBookings(allBookings);

  return (
    <GuestPageShell config={config}>
      <BookingsProvider currentBookings={currentBookings} previousBookings={previousBookings}>
        <ThemeRenderer
          templateKey="stays"
          config={config}
          booking={booking}
          bookingStatus={bookingStatus}
          token={token}
        />
      </BookingsProvider>
    </GuestPageShell>
  );
}
