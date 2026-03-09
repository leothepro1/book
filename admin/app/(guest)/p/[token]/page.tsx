import "./page.css";
import { getTenantConfig } from "../../_lib/tenant";
import { resolveBookingFromToken } from "../../_lib/portal/resolveBooking";
import { getBookingStatus } from "../../_lib/booking";
import { ThemeRenderer } from "../../_lib/themes";
import "../../_components/cards/cards.css";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ token?: string }> }) {
  const params = await props.params;
  const token = params?.token;

  const booking = await resolveBookingFromToken(token);

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen bokning hittades.</div>;
  }

  const isPreview = token === "preview" || token === "test";
  const config = await getTenantConfig(booking.tenantId ?? "default", { preferDraft: isPreview });

  if (isPreview) {
    console.log(`[PortalHome] Preview render: ${(config.home?.cards as any[])?.length ?? 0} cards, draft=${isPreview}`);
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
