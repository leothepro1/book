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
 * If guest has bookings: shows booking list.
 * If guest has no bookings but has orders: redirects to orders.
 * If guest has neither: shows empty state.
 */
export default async function SessionStaysPage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");

  // No bookings — show orders if available, or empty state
  if (ctx.bookings.length === 0) {
    if (ctx.orders.length > 0) {
      redirect("/portal/orders");
    }
    return (
      <GuestPageShell config={ctx.config}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(2rem, 5vw, 3rem) 1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>
            Mina vistelser
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--text)", opacity: 0.6 }}>
            Du har inga vistelser ännu.
          </p>
        </div>
      </GuestPageShell>
    );
  }

  const bookingStatus = ctx.primaryBooking
    ? getBookingStatus(ctx.primaryBooking)
    : "upcoming";

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
          booking={ctx.primaryBooking ?? ctx.bookings[0]}
          bookingStatus={bookingStatus}
        />
      </BookingsProvider>
    </GuestPageShell>
  );
}
