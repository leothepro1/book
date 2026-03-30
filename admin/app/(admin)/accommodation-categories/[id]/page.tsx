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
      addonCollections: {
        orderBy: { sortOrder: "asc" },
        select: {
          collectionId: true,
          sortOrder: true,
          collection: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              status: true,
              _count: { select: { items: true } },
            },
          },
        },
      },
    },
  });

  if (!category) notFound();

  const initialAddonCollections = category.addonCollections.map((ac) => ({
    id: ac.collection.id,
    title: ac.collection.title,
    imageUrl: ac.collection.imageUrl,
    status: ac.collection.status,
    productCount: ac.collection._count.items,
  }));

  const serialized = JSON.parse(JSON.stringify(category));
  return (
    <AccommodationCategoryForm
      category={serialized}
      initialAddonCollections={initialAddonCollections}
    />
  );
}
