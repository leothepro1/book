import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { SpotBookingEditor } from "./SpotBookingEditor";

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

  if (!tenantApp || tenantApp.status === "UNINSTALLED") {
    redirect("/apps");
  }

  if (tenantApp.status === "PENDING_SETUP") {
    redirect("/apps/spot-booking/setup");
  }

  // Load SpotMap with markers
  const spotMap = await prisma.spotMap.findUnique({
    where: { tenantAppId: tenantApp.id },
    include: {
      markers: {
        include: {
          accommodation: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      accommodationCategory: {
        select: { id: true, title: true },
      },
    },
  });

  if (!spotMap) {
    redirect("/apps/spot-booking/setup");
  }

  // Load all tenant accommodations for linking
  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId, archivedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      externalCode: true,
    },
    orderBy: { name: "asc" },
  });

  const linkedIds = new Set(spotMap.markers.map((m) => m.accommodationId));

  const initialData = {
    spotMap: {
      id: spotMap.id,
      imageUrl: spotMap.imageUrl,
      addonPrice: spotMap.addonPrice,
      currency: spotMap.currency,
      category: spotMap.accommodationCategory,
    },
    markers: spotMap.markers.map((m) => ({
      id: m.id,
      label: m.label,
      x: m.x,
      y: m.y,
      accommodationId: m.accommodationId,
      accommodationName: m.accommodation.name,
      accommodationSlug: m.accommodation.slug,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      externalCode: a.externalCode,
      linked: linkedIds.has(a.id),
    })),
  };

  return <SpotBookingEditor initialData={initialData} />;
}
