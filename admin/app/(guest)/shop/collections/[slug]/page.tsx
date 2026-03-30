import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { formatPriceDisplay, getVariantPriceRange } from "@/app/_lib/products/pricing";
import "./collection-page.css";

export const revalidate = 60;
export const dynamicParams = true;

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const collection = await prisma.productCollection.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            include: {
              media: { orderBy: { sortOrder: "asc" }, take: 1 },
              variants: { select: { price: true } },
            },
          },
        },
      },
    },
  });

  if (!collection || collection.status !== "ACTIVE") return notFound();

  // Filter to only ACTIVE products
  const products = collection.items
    .map((item) => item.product)
    .filter((p) => p.status === "ACTIVE");

  return (
    <div className="cp">
      <div className="cp__header">
        <h1 className="cp__title">{collection.title}</h1>
        {collection.description && (
          <p className="cp__description">{collection.description}</p>
        )}
      </div>

      <div className="cp__grid">
        {products.map((product) => {
          const image = product.media[0];
          const { min, max } = getVariantPriceRange(
            product.price,
            product.variants,
          );

          return (
            <Link
              key={product.id}
              href={`/shop/products/${product.slug}`}
              className="cp__card"
            >
              <div className="cp__card-image">
                {image ? (
                  <img src={image.url} alt={image.alt || product.title} />
                ) : (
                  <div className="cp__card-placeholder" />
                )}
              </div>
              <div className="cp__card-info">
                <h3 className="cp__card-title">{product.title}</h3>
                <span className="cp__card-price">
                  {min === max
                    ? `${formatPriceDisplay(min, product.currency)} kr`
                    : `${formatPriceDisplay(min, product.currency)} – ${formatPriceDisplay(max, product.currency)} kr`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {products.length === 0 && (
        <p className="cp__empty">Inga produkter i denna kollektion.</p>
      )}
    </div>
  );
}
