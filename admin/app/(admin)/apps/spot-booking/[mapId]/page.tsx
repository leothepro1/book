import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { SpotBookingEditor } from "../SpotBookingEditor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ mapId: string }>;
};

export default async function SpotBookingEditorPage({ params }: Props) {
  const { mapId } = await params;

  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const tenantData = await getCurrentTenant();
  if (!tenantData) redirect("/apps");

  const tenantId = tenantData.tenant.id;

  // Load SpotMap by ID with tenant isolation
  const spotMap = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    include: {
      markers: {
        include: {
          accommodation: {
            select: { id: true, name: true, slug: true },
          },
          unit: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      accommodationItems: {
        select: {
          accommodationId: true,
          accommodation: { select: { id: true, name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!spotMap) {
    redirect("/apps/spot-booking");
  }

  // Load all tenant accommodations for linking
  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId, archivedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      externalCode: true,
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      spotMapItem: { select: { spotMapId: true } },
    },
    orderBy: { name: "asc" },
  });

  const linkedIds = new Set(spotMap.markers.map((m) => m.accommodationId));

  // Load AccommodationUnit rows for accommodations linked to this SpotMap
  const linkedAccommodationIds = spotMap.accommodationItems.map((ai) => ai.accommodationId);
  const accommodationUnits = await prisma.accommodationUnit.findMany({
    where: {
      tenantId,
      accommodationId: { in: linkedAccommodationIds },
      status: "AVAILABLE",
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      accommodationId: true,
      accommodation: { select: { name: true } },
    },
    orderBy: [{ accommodationId: "asc" }, { name: "asc" }],
  });

  const assignedUnitIds = new Set(
    spotMap.markers.map((m) => m.accommodationUnitId).filter(Boolean),
  );

  const initialData = {
    spotMap: {
      id: spotMap.id,
      title: spotMap.title,
      subtitle: spotMap.subtitle,
      imageUrl: spotMap.imageUrl,
      imagePublicId: spotMap.imagePublicId,
      addonPrice: spotMap.addonPrice,
      currency: spotMap.currency,
      accommodationItems: spotMap.accommodationItems.map((ai) => ({
        id: ai.accommodation.id,
        name: ai.accommodation.name,
      })),
      version: spotMap.version,
      draftConfig: spotMap.draftConfig as Record<string, unknown> | null,
    },
    markers: spotMap.markers.map((m) => ({
      id: m.id,
      label: m.label,
      x: m.x,
      y: m.y,
      accommodationId: m.accommodationId,
      accommodationName: m.accommodation.name,
      accommodationSlug: m.accommodation.slug,
      accommodationUnitId: m.accommodationUnitId ?? null,
      unitName: m.unit?.name ?? null,
      priceOverride: m.priceOverride ?? null,
      color: m.color ?? null,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      externalCode: a.externalCode,
      imageUrl: a.media[0]?.url ?? null,
      linked: linkedIds.has(a.id),
      assignedToThisMap: a.spotMapItem?.spotMapId === mapId,
      assignedToOtherMap: a.spotMapItem != null && a.spotMapItem.spotMapId !== mapId,
    })),
    units: accommodationUnits.map((u) => ({
      id: u.id,
      name: u.name,
      externalId: u.externalId,
      accommodationId: u.accommodationId,
      accommodationName: u.accommodation.name,
      assigned: assignedUnitIds.has(u.id),
    })),
  };

  return <SpotBookingEditor initialData={initialData} />;
}
