import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import { prisma } from "../../../../_lib/db/prisma";
import StaysTabs from "./StaysTabs";
import { createGlobalMockBooking, createGlobalMockHistory } from "@/app/_lib/mockData";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function Page(props: {
  params: Promise<{ token?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const searchParams = (await props.searchParams) ?? {};

  const token = params?.token;
  const lang = (searchParams?.lang === "en" ? "en" : "sv") as "sv" | "en";

  // PREVIEW or TEST MODE: Use global mock bookings
  console.log("[STAYS PAGE] Token received:", token);
  if (token === "preview" || token === "test") {
    let tenant = null;
    
  console.log("[STAYS PAGE] Entering preview/test mode");
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
      const mockCurrent = createGlobalMockBooking(tenant.id);
      const mockHistory = createGlobalMockHistory(tenant.id);
      const allBookings = [mockCurrent, ...mockHistory];

      const now = new Date();
      const currentBookings = allBookings.filter(
        (b) => new Date(b.departure) >= now
      );
      const previousBookings = allBookings.filter(
        (b) => new Date(b.departure) < now
      );

      return (
        <div className="g-container">
          <h1 className="g-heading" style={{ fontSize: 22, marginBottom: 16 }}>
            {lang === "en" ? "Stays" : "Bokningar"}
          </h1>

          <StaysTabs
            currentBookings={currentBookings as any}
            previousBookings={previousBookings as any}
            lang={lang}
          />
        </div>
      );
    }
  }

  // NORMAL FLOW: Real bookings
  const current = await resolveBookingFromToken(token);

  if (!current) {
    return <div className="g-container">No booking found.</div>;
  }

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId: current.tenantId,
      guestEmail: current.guestEmail,
    },
    orderBy: {
      arrival: "desc",
    },
  });

  // Split bookings into current and previous
  const now = new Date();
  const currentBookings = bookings.filter(
    (b) => new Date(b.departure) >= now
  );
  const previousBookings = bookings.filter(
    (b) => new Date(b.departure) < now
  );

  return (
    <div className="g-container">
      <h1 className="g-heading" style={{ fontSize: 22, marginBottom: 16 }}>
        {lang === "en" ? "Stays" : "Bokningar"}
      </h1>

      <StaysTabs
        currentBookings={currentBookings}
        previousBookings={previousBookings}
        lang={lang}
      />
    </div>
  );
}
