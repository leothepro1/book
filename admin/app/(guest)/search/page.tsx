import { notFound } from "next/navigation";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "../_lib/portal/resolveBooking";
import { getBookingStatus } from "../_lib/booking";
import { ThemeRenderer } from "../_lib/themes";
import GuestPageShell from "../_components/GuestPageShell";

export const dynamic = "force-dynamic";

/**
 * /stays — public availability search page.
 * Renders via ThemeRenderer with templateKey="stays" — same pipeline
 * as the editor preview. SearchResults locked section handles the
 * search form and results client-side.
 */
export default async function StaysPage() {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const config = await getTenantConfig(tenant.id, {});

  // ThemeRenderer requires a booking context — use preview mock
  const booking = await resolveBookingFromToken("preview");
  if (!booking) return notFound();

  const bookingStatus = getBookingStatus(booking);

  return (
    <GuestPageShell config={config}>
      <ThemeRenderer
        templateKey="stays"
        config={config}
        booking={booking}
        bookingStatus={bookingStatus}
        token="preview"
      />
    </GuestPageShell>
  );
}
