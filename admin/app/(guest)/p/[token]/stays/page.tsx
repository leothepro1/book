import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import StaysTabs from "./StaysTabs";
import { createMockNormalizedBookings } from "@/app/_lib/mockData";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { getStaysCoreConfig } from "@/app/_lib/pages/config";
import { resolveColorScheme } from "@/app/_lib/color-schemes/resolve";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { prisma } from "../../../../_lib/db/prisma";

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
      const { userId, orgId } = await getAuth();
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
      const config = await getTenantConfig(tenant.id, { preferDraft: token === "preview" });
      const stays = getStaysCoreConfig(config);

      const allMock = createMockNormalizedBookings(tenant.id);

      const now = new Date();
      const currentBookings = allMock.filter(
        (b) => new Date(b.departure) >= now
      );
      const previousBookings = allMock.filter(
        (b) => new Date(b.departure) < now
      );

      const resolved = resolveColorScheme(stays.colorSchemeId, config.colorSchemes ?? [], config.defaultColorSchemeId);
      const containerStyle: React.CSSProperties = {
        ...resolved?.cssVariables,
        padding: `${stays.paddingTop}px ${stays.paddingRight}px ${stays.paddingBottom}px ${stays.paddingLeft}px`,
      };

      return (
        <div className="g-container" style={containerStyle}>
          <h1 className="g-heading" style={{ fontSize: stays.headingSize, marginBottom: stays.description ? 8 : stays.headingMarginBottom }} dangerouslySetInnerHTML={{ __html: stays.heading }} />
          {stays.description && (
            <p className="g-description" style={{ marginBottom: stays.headingMarginBottom }} dangerouslySetInnerHTML={{ __html: stays.description }} />
          )}

          <StaysTabs
            currentBookings={currentBookings}
            previousBookings={previousBookings}
            lang={lang}
            layout={stays.layout}
            cardShadow={stays.cardShadow}
            tabCurrentLabel={stays.tabCurrentLabel}
            tabPreviousLabel={stays.tabPreviousLabel}
            cardImageUrl={stays.cardImageUrl}
          />
        </div>
      );
    }
  }

  // NORMAL FLOW: Real bookings via adapter
  const current = await resolveBookingFromToken(token);

  if (!current) {
    return <div className="g-container">No booking found.</div>;
  }

  const config = await getTenantConfig(current.tenantId);
  const stays = getStaysCoreConfig(config);

  let allBookings: import("@/app/_lib/integrations/types").NormalizedBooking[];
  try {
    const adapter = await resolveAdapter(current.tenantId);
    allBookings = await adapter.getBookings(current.tenantId, { guestEmail: current.guestEmail });
  } catch (error) {
    console.error("[STAYS PAGE] Adapter error, returning empty:", error);
    allBookings = [];
  }

  // Split bookings into current and previous
  const now = new Date();
  const currentBookings = allBookings.filter(
    (b) => new Date(b.departure) >= now
  );
  const previousBookings = allBookings.filter(
    (b) => new Date(b.departure) < now
  );

  const resolved = resolveColorScheme(stays.colorSchemeId, config.colorSchemes ?? [], config.defaultColorSchemeId);
  const containerStyle: React.CSSProperties = {
    ...resolved?.cssVariables,
    padding: `${stays.paddingTop}px ${stays.paddingRight}px ${stays.paddingBottom}px ${stays.paddingLeft}px`,
  };

  return (
    <div className="g-container" style={containerStyle}>
      <h1 className="g-heading" style={{ fontSize: stays.headingSize, marginBottom: stays.description ? 8 : stays.headingMarginBottom }} dangerouslySetInnerHTML={{ __html: stays.heading }} />
      {stays.description && (
        <p className="g-description" style={{ marginBottom: stays.headingMarginBottom }} dangerouslySetInnerHTML={{ __html: stays.description }} />
      )}

      <StaysTabs
        currentBookings={currentBookings}
        previousBookings={previousBookings}
        lang={lang}
        layout={stays.layout}
        tabCurrentLabel={stays.tabCurrentLabel}
        tabPreviousLabel={stays.tabPreviousLabel}
        cardImageUrl={stays.cardImageUrl}
      />
    </div>
  );
}
