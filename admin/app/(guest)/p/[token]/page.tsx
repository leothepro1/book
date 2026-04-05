import "./page.css";
import { getTenantConfig } from "../../_lib/tenant";
import { resolveBookingFromToken } from "../../_lib/portal/resolveBooking";
import { getBookingStatus } from "../../_lib/booking";
import { ThemeRenderer } from "../../_lib/themes";
import "../../_components/cards/cards.css";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import GuestPageShell from "../../_components/GuestPageShell";
import { getRequestLocale } from "../../_lib/locale/getRequestLocale";
export const dynamic = "force-dynamic";

/**
 * /p/[token] home page — preview rendering only.
 * Real tokens are redirected by the parent layout before this page renders.
 * Only preview/test tokens reach this code path (editor canvas).
 */
export default async function Page(props: { params: Promise<{ token?: string }> }) {
  const params = await props.params;
  const token = params?.token;

  const booking = await resolveBookingFromToken(token);

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen bokning hittades.</div>;
  }

  const locale = await getRequestLocale();
  const config = await getTenantConfig(booking.tenantId ?? "default", { preferDraft: token === "preview", locale });

  const bookingStatus = getBookingStatus(booking);

  return (
    <GuestPageShell config={config} pageId="home">
      <ThemeRenderer
        templateKey="home"
        config={config}
        booking={booking}
        bookingStatus={bookingStatus}
        token={token}
      />
    </GuestPageShell>
  );
}
