import "./page.css";
import { getTenantConfig } from "../../_lib/tenant";
import { resolveBookingFromToken } from "../../_lib/portal/resolveBooking";
import { getBookingStatus } from "../../_lib/booking";
import { ThemeRenderer } from "../../_lib/themes";
import "../../_components/cards/cards.css";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ token?: string }> }) {
  const params = await props.params;
  const token = params?.token;

  const isPreview = token === "preview" || token === "test";

  // Resolve booking: preview/test uses mock, real uses adapter
  let booking;
  if (isPreview) {
    booking = await resolveBookingFromToken(token);
  } else {
    // Resolve token → booking via platform infrastructure (magic links, booking IDs)
    const resolved = await resolveBookingFromToken(token);
    if (resolved) {
      // Re-fetch via adapter to get the latest data from the PMS
      try {
        const adapter = await resolveAdapter(resolved.tenantId);
        booking = await adapter.getBooking(resolved.tenantId, resolved.externalId);
      } catch (error) {
        console.error("[PortalHome] Adapter error, using resolved booking:", error);
        booking = resolved;
      }
      // Fall back to token-resolved booking if adapter returns null
      if (!booking) booking = resolved;
    }
  }

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen bokning hittades.</div>;
  }

  const config = await getTenantConfig(booking.tenantId ?? "default", { preferDraft: isPreview });

  if (isPreview) {
    console.log(`[PortalHome] Preview render: ${config.home?.cards?.length ?? 0} cards, draft=${isPreview}`);
  }

  const bookingStatus = getBookingStatus(booking);

  return (
    <ThemeRenderer
      templateKey="home"
      config={config}
      booking={booking}
      bookingStatus={bookingStatus}
      token={token}
    />
  );
}
