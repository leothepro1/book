import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import { prisma } from "../../../../_lib/db/prisma";
import StaysTabs from "./StaysTabs";

export const dynamic = "force-dynamic";

export default async function Page(props: {
  params: Promise<{ token?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const searchParams = (await props.searchParams) ?? {};

  const token = params?.token;
  const lang = (searchParams?.lang === "en" ? "en" : "sv") as "sv" | "en";

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
