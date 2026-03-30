import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { notFound } from "next/navigation";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import AccommodationsPageClient from "./AccommodationsPageClient";
import "./accommodations.css";

export const dynamic = "force-dynamic";

export default async function AccommodationsPage() {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return notFound();

  const tenantId = tenantData.tenant.id;

  const rows = await prisma.accommodation.findMany({
    where: { tenantId, archivedAt: null },
    select: ACCOMMODATION_SELECT,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const accommodations = rows.map((row) =>
    resolveAccommodation(row as unknown as AccommodationWithRelations),
  );

  // Serialize dates for client component
  const serialized = JSON.parse(JSON.stringify(accommodations));

  return <AccommodationsPageClient accommodations={serialized} tenantId={tenantId} />;
}
