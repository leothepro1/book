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
      accommodationCategory: {
        select: { id: true, title: true },
      },
      _count: { select: { markers: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // If no maps exist (edge case: all deleted), show empty list
  // Load available categories for the "create new map" modal
  const categories = await prisma.accommodationCategory.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      _count: { select: { items: true } },
    },
  });

  const usedCategoryIds = new Set(spotMaps.map((m) => m.accommodationCategoryId));

  const maps = spotMaps.map((m) => ({
    id: m.id,
    imageUrl: m.imageUrl,
    addonPrice: m.addonPrice,
    currency: m.currency,
    isActive: m.isActive,
    markerCount: m._count.markers,
    category: m.accommodationCategory,
  }));

  const availableCategories = categories.map((c) => ({
    id: c.id,
    title: c.title,
    accommodationCount: c._count.items,
    used: usedCategoryIds.has(c.id),
  }));

  return <SpotMapList maps={maps} categories={availableCategories} />;
}
