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

  const [rows, categoryRows] = await Promise.all([
    prisma.accommodation.findMany({
      where: { tenantId, archivedAt: null },
      select: ACCOMMODATION_SELECT,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.accommodationCategory.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { id: true, title: true, slug: true, sortOrder: true },
    }),
  ]);

  const accommodations = rows.map((row) =>
    resolveAccommodation(row as unknown as AccommodationWithRelations),
  );

  const serialized = JSON.parse(JSON.stringify(accommodations));

  return (
    <AccommodationsPageClient
      accommodations={serialized}
      categories={categoryRows}
      tenantId={tenantId}
    />
  );
}
