import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { ProductDetail } from "./ProductDetail";

export const revalidate = 60;
export const dynamicParams = true;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  // Check if this slug matches an Accommodation — redirect to /stays/[slug]
  const accommodation = await prisma.accommodation.findFirst({
    where: { tenantId: tenant.id, slug, archivedAt: null },
    select: { id: true },
  });
  if (accommodation) {
    const { redirect } = await import("next/navigation");
    redirect(`/stays/${slug}`);
  }

  const product = await prisma.product.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      options: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!product || product.status !== "ACTIVE") return notFound();

  // STANDARD / GIFT_CARD → cart flow page
  return (
    <ProductDetail
      product={{
        id: product.id,
        title: product.title,
        description: product.description,
        slug: product.slug,
        price: product.price,
        currency: product.currency,
        compareAtPrice: product.compareAtPrice,
        trackInventory: product.trackInventory,
        inventoryQuantity: product.inventoryQuantity,
        continueSellingWhenOutOfStock: product.continueSellingWhenOutOfStock,
        media: product.media.map((m) => ({ id: m.id, url: m.url, type: m.type, alt: m.alt })),
        options: product.options.map((o) => ({ id: o.id, name: o.name, values: o.values as string[] })),
        variants: product.variants.map((v) => ({
          id: v.id, option1: v.option1, option2: v.option2, option3: v.option3,
          price: v.price, compareAtPrice: v.compareAtPrice, imageUrl: v.imageUrl, sku: v.sku,
          trackInventory: v.trackInventory, inventoryQuantity: v.inventoryQuantity,
          continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
        })),
      }}
    />
  );
}
