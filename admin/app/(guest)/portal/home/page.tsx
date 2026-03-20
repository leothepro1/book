import { redirect } from "next/navigation";
import { resolveGuestContext } from "../../_lib/portal/resolveGuestContext";
import { getBookingStatus } from "../../_lib/booking";
import { ThemeRenderer } from "../../_lib/themes";
import GuestPageShell from "../../_components/GuestPageShell";
import "../../_components/cards/cards.css";

export const dynamic = "force-dynamic";

/**
 * Session-driven home page.
 * Mirrors /p/[token]/page.tsx but loads data from guest session
 * instead of URL token. Does not call PMS adapter — shows DB data.
 */
export default async function SessionHomePage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");
  if (!ctx.primaryBooking) redirect("/no-booking");

  const bookingStatus = getBookingStatus(ctx.primaryBooking);

  return (
    <GuestPageShell config={ctx.config}>
      <ThemeRenderer
        templateKey="home"
        config={ctx.config}
        booking={ctx.primaryBooking}
        bookingStatus={bookingStatus}
      />
    </GuestPageShell>
  );
}
