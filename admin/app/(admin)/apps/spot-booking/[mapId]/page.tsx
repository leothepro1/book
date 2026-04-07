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
        },
        orderBy: { createdAt: "asc" },
      },
      accommodationCategory: {
        select: { id: true, title: true },
      },
    },
  });

  if (!spotMap) {
    redirect("/apps/spot-booking");
  }

  // Load all active accommodation categories for settings picker
  const categories = await prisma.accommodationCategory.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, imageUrl: true },
  });

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
      imagePublicId: spotMap.imagePublicId,
      addonPrice: spotMap.addonPrice,
      currency: spotMap.currency,
      category: spotMap.accommodationCategory,
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
      priceOverride: m.priceOverride ?? null,
      color: m.color ?? null,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      externalCode: a.externalCode,
      linked: linkedIds.has(a.id),
    })),
    categories,
  };

  return <SpotBookingEditor initialData={initialData} />;
}
