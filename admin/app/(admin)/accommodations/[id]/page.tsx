import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { notFound } from "next/navigation";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import AccommodationForm from "./AccommodationForm";

export const dynamic = "force-dynamic";

export default async function AccommodationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) return notFound();

  const tenantId = tenantData.tenant.id;

  const row = await prisma.accommodation.findFirst({
    where: { id, tenantId, archivedAt: null },
    select: ACCOMMODATION_SELECT,
  });

  if (!row) return notFound();

  const accommodation = resolveAccommodation(
    row as unknown as AccommodationWithRelations,
  );

  const serialized = JSON.parse(JSON.stringify(accommodation));

  return <AccommodationForm accommodation={serialized} tenantId={tenantId} />;
}
