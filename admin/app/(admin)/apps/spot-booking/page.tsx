import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getApp } from "@/app/_lib/apps/registry";
import { getSetupStatus } from "@/app/_lib/apps/setup";
import { prisma } from "@/app/_lib/db/prisma";
import { SpotMapList } from "./SpotMapList";

// Force registration of all app definitions
import "@/app/_lib/apps/definitions";

export const dynamic = "force-dynamic";

export default async function SpotBookingPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const tenantData = await getCurrentTenant();
  if (!tenantData) redirect("/apps");

  const tenantId = tenantData.tenant.id;

  // Check installation
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "spot-booking" } },
    select: { id: true, status: true },
  });

  // Not installed → show the app listing / install page
  if (!tenantApp || tenantApp.status === "UNINSTALLED") {
    const appDef = getApp("spot-booking");
    if (!appDef) redirect("/apps");

    const setup = await getSetupStatus(tenantId);
    const { AppListingPage } = await import(
      "@/app/(admin)/apps/[appId]/AppListingPage"
    );

    return <AppListingPage app={appDef} status={null} setupReady={setup.isReadyForApps} />;
  }

  if (tenantApp.status === "PENDING_SETUP") {
    redirect("/apps/spot-booking/setup");
  }

  // Load all SpotMaps for this installation
  const spotMaps = await prisma.spotMap.findMany({
    where: { tenantAppId: tenantApp.id },
    include: {
      accommodationItems: {
        select: { accommodation: { select: { id: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { markers: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Load unassigned accommodations for the "create new map" modal
  const unassigned = await prisma.accommodation.findMany({
    where: { tenantId, status: "ACTIVE", spotMapItem: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      categoryItems: {
        select: { category: { select: { title: true } } },
        take: 1,
      },
    },
  });

  const maps = spotMaps.map((m) => ({
    id: m.id,
    title: m.title,
    imageUrl: m.imageUrl,
    addonPrice: m.addonPrice,
    currency: m.currency,
    isActive: m.isActive,
    markerCount: m._count.markers,
    accommodationNames: m.accommodationItems.map((ai) => ai.accommodation.name),
  }));

  const availableAccommodations = unassigned.map((a) => ({
    id: a.id,
    name: a.name,
    categoryTitle: a.categoryItems[0]?.category.title ?? "",
  }));

  return <SpotMapList maps={maps} accommodations={availableAccommodations} />;
}
