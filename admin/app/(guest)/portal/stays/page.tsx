import { redirect } from "next/navigation";
import { resolveGuestContext } from "../../_lib/portal/resolveGuestContext";
import { getBookingStatus } from "../../_lib/booking";
import { ThemeRenderer } from "../../_lib/themes";
import { BookingsProvider } from "../../_components/sections";
import GuestPageShell from "../../_components/GuestPageShell";
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

/**
 * Session-driven stays page.
 * Mirrors /p/[token]/stays/page.tsx but loads data from guest session.
 */
export default async function SessionStaysPage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");
  if (!ctx.primaryBooking) redirect("/no-booking");

  const bookingStatus = getBookingStatus(ctx.primaryBooking);
  const { currentBookings, previousBookings } = splitBookings(ctx.bookings);

  return (
    <GuestPageShell config={ctx.config}>
      <BookingsProvider
        currentBookings={currentBookings}
        previousBookings={previousBookings}
      >
        <ThemeRenderer
          templateKey="stays"
          config={ctx.config}
          booking={ctx.primaryBooking}
          bookingStatus={bookingStatus}
        />
      </BookingsProvider>
    </GuestPageShell>
  );
}
