import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import CollectionForm from "../_components/CollectionForm";

export const dynamic = "force-dynamic";

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) notFound();

  const collection = await prisma.productCollection.findFirst({
    where: { id, tenantId: tenantData.tenant.id },
    include: {
      items: {
        include: { product: { select: { id: true, title: true, media: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!collection) notFound();

  // Fetch addon collection if linked
  let addonCollection = null;
  if (collection.addonCollectionId) {
    addonCollection = await prisma.productCollection.findUnique({
      where: { id: collection.addonCollectionId },
      select: { id: true, title: true, imageUrl: true },
    });
  }

  const serialized = JSON.parse(JSON.stringify({ ...collection, addonCollection }));
  return <CollectionForm collection={serialized} />;
}
