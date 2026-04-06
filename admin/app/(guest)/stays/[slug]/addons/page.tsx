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

  // Already at checkout — skip addons
  if (session.status === "CHECKOUT") {
    redirect(`/checkout?session=${session.token}`);
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

  // ── Check for active SpotMap for this accommodation's category ──
  const accWithCategories = await prisma.accommodation.findFirst({
    where: { id: session.accommodationId!, tenantId: session.tenantId },
    select: { categoryItems: { select: { categoryId: true } } },
  });

  let spotAddon: SpotAddon | null = null;

  if (accWithCategories && accWithCategories.categoryItems.length > 0) {
    const categoryIds = accWithCategories.categoryItems.map((i) => i.categoryId);
    const activeSpotMap = await prisma.spotMap.findFirst({
      where: {
        tenantId: session.tenantId,
        accommodationCategoryId: { in: categoryIds },
        isActive: true,
      },
      select: {
        id: true,
        imageUrl: true,
        addonPrice: true,
        currency: true,
        accommodationCategoryId: true,
      },
    });

    if (activeSpotMap) {
      spotAddon = {
        id: "spot-booking-virtual",
        type: "spot_map" as const,
        title: "Valj din plats",
        description: "Valj exakt var du vill bo pa omradet",
        imageUrl: activeSpotMap.imageUrl,
        addonPrice: activeSpotMap.addonPrice,
        currency: activeSpotMap.currency,
        spotMapId: activeSpotMap.id,
        accommodationCategoryId: activeSpotMap.accommodationCategoryId,
      };
    }
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
        accommodationName: session.accommodationName!,
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
