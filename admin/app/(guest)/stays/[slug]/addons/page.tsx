import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { resolveAddonsForAccommodation } from "@/app/_lib/accommodations/addons";
import type { AddonProduct } from "@/app/_lib/accommodations/addons";
import { AddonsClient } from "./AddonsClient";
import type { SpotAddon } from "./AddonsClient";

export const dynamic = "force-dynamic";

/**
 * /stays/[slug]/addons?session=[token]
 *
 * Step 2 of 3 in checkout: addon selection.
 * Session is the single source of truth.
 * Server-side gate ensures session validity before rendering.
 */
export default async function AddonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const token = sp.session;

  if (!token) redirect("/stays");

  const tenant = await resolveTenantFromHost();
  if (!tenant) redirect("/stays");

  // ── Load + gate session ─────────────────────────────────────
  const session = await prisma.checkoutSession.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      status: true,
      expiresAt: true,
      token: true,
      accommodationId: true,
      accommodationName: true,
      accommodationSlug: true,
      ratePlanName: true,
      ratePlanCancellationPolicy: true,
      pricePerNight: true,
      totalNights: true,
      accommodationTotal: true,
      currency: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      ratePlanId: true,
      accommodation: {
        select: { media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
      },
    },
  });

  // Session not found or wrong tenant → silent redirect
  if (!session || session.tenantId !== tenant.id) redirect("/stays");

  // Expired or abandoned
  if (session.status === "EXPIRED" || session.status === "ABANDONED") {
    redirect("/stays?error=session_expired");
  }

  // Already completed
  if (session.status === "COMPLETED") {
    redirect(`/checkout/confirmation/${session.token}`);
  }

  // Returning from checkout — allow re-editing addons
  if (session.status === "CHECKOUT") {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { status: "ADDON_SELECTION" },
    });
  }

  // Expired by time
  if (session.expiresAt < new Date()) {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    redirect("/stays?error=session_expired");
  }

  // PENDING → transition to ADDON_SELECTION atomically
  if (session.status === "PENDING") {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { status: "ADDON_SELECTION" },
    });
  }

  // ── Load addon products from DB ─────────────────────────────
  const addonProducts = await resolveAddonsForAccommodation(
    session.accommodationId!,
    session.tenantId,
  );

  // ── Check for active SpotMap linked to this accommodation ──
  let spotAddon: SpotAddon | null = null;

  const activeSpotMap = await prisma.spotMap.findFirst({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      accommodationItems: { some: { accommodationId: session.accommodationId! } },
    },
    select: {
      id: true,
      title: true,
      subtitle: true,
      imageUrl: true,
      addonPrice: true,
      currency: true,
    },
  });

  if (activeSpotMap) {
    // Resolve min price across all markers to determine "Från" display
    const markers = await prisma.spotMarker.findMany({
      where: { spotMapId: activeSpotMap.id },
      select: { priceOverride: true },
    });

    const prices = markers.map((m) =>
      m.priceOverride != null && m.priceOverride >= 0
        ? m.priceOverride
        : activeSpotMap.addonPrice,
    );
    const minPrice = prices.length > 0 ? Math.min(...prices) : activeSpotMap.addonPrice;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : activeSpotMap.addonPrice;

    spotAddon = {
      id: "spot-booking-virtual",
      type: "spot_map" as const,
      title: activeSpotMap.title,
      description: activeSpotMap.subtitle,
      imageUrl: activeSpotMap.imageUrl,
      addonPrice: minPrice,
      hasVariedPricing: minPrice !== maxPrice,
      currency: activeSpotMap.currency,
      spotMapId: activeSpotMap.id,
    };
  }

  // Serialize for client
  const serializedAddons: AddonProduct[] = JSON.parse(JSON.stringify(addonProducts));

  // Build back URL from session snapshot
  const backUrl = `/stays/${session.accommodationSlug}?checkIn=${format(session.checkIn!, "yyyy-MM-dd")}&checkOut=${format(session.checkOut!, "yyyy-MM-dd")}&guests=${session.adults}&ratePlanId=${session.ratePlanId}`;

  // Load tenant config for header/footer
  const config = await getTenantConfig(tenant.id);

  return (
    <GuestPageShell config={config}>
    <AddonsClient
      token={session.token}
      addons={serializedAddons}
      spotAddon={spotAddon}
      snapshot={{
        accommodationId: session.accommodationId!,
        accommodationName: session.accommodationName!,
        accommodationImage: session.accommodation?.media[0]?.url ?? null,
        accommodationSlug: session.accommodationSlug!,
        ratePlanName: session.ratePlanName!,
        ratePlanCancellationPolicy: session.ratePlanCancellationPolicy!,
        pricePerNight: session.pricePerNight!,
        totalNights: session.totalNights!,
        accommodationTotal: session.accommodationTotal!,
        currency: session.currency,
        checkIn: format(session.checkIn!, "yyyy-MM-dd"),
        checkOut: format(session.checkOut!, "yyyy-MM-dd"),
        adults: session.adults!,
      }}
      backUrl={backUrl}
    />
    </GuestPageShell>
  );
}
