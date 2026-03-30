import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import AccommodationCategoryForm from "../_components/AccommodationCategoryForm";

export const dynamic = "force-dynamic";

export default async function EditAccommodationCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) notFound();

  const category = await prisma.accommodationCategory.findFirst({
    where: { id, tenantId: tenantData.tenant.id },
    include: {
      items: {
        include: {
          accommodation: {
            select: {
              id: true,
              name: true,
              nameOverride: true,
              status: true,
              accommodationType: true,
              media: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!category) notFound();

  const serialized = JSON.parse(JSON.stringify(category));
  return <AccommodationCategoryForm category={serialized} />;
}
