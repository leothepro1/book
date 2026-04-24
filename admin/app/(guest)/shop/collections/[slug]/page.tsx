import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { applyTranslations, applyTranslationsBatch } from "@/app/_lib/translations/apply-db-translations";
import { ProductCard } from "@/app/(guest)/_components/cards/ProductCard";
import { toNextMetadata } from "@/app/_lib/seo/next-metadata";
import { resolveSeoForRequest } from "@/app/_lib/seo/request-cache";
import "./collection-page.css";

export const revalidate = 60;
export const dynamicParams = true;

// ── SEO metadata ──────────────────────────────────────────────
//
// Runs before the page body. Not-found tenants/collections return
// a noindex stub — never throw from generateMetadata (Next would
// 500 the whole request).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return { title: "Not found", robots: { index: false } };
  }

  const locale = await getRequestLocale();
  const resolved = await resolveSeoForRequest(
    tenant.id,
    slug,
    locale,
    "product_collection",
  );
  if (!resolved) {
    return { title: "Not found", robots: { index: false } };
  }

  return toNextMetadata(resolved);
}

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
              variants: { select: { price: true, compareAtPrice: true } },
            },
          },
        },
      },
    },
  });

  if (!collection || collection.status !== "ACTIVE") return notFound();

  // Apply locale translations
  const locale = await getRequestLocale();
  const translatedCollection = await applyTranslations(
    tenant.id, locale, "collection", collection.id,
    { title: collection.title, description: collection.description ?? "" },
    ["title", "description"],
  );
  collection.title = translatedCollection.title as string;
  collection.description = translatedCollection.description as string;

  // Filter to only ACTIVE products
  const products = collection.items
    .map((item) => item.product)
    .filter((p) => p.status === "ACTIVE");

  // Translate product titles/descriptions in one batch query
  await applyTranslationsBatch(tenant.id, locale, "product", products, ["title", "description"]);

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
          return (
            <ProductCard
              key={product.id}
              title={product.title}
              slug={product.slug}
              price={product.price}
              currency={product.currency}
              compareAtPrice={product.compareAtPrice}
              variants={product.variants.map((v) => ({
                price: v.price,
                compareAtPrice: v.compareAtPrice,
              }))}
              featuredImage={image
                ? { url: image.url, alt: image.alt }
                : null}
              aspectRatio="3:4"
            />
          );
        })}
      </div>

      {products.length === 0 && (
        <p className="cp__empty">Inga produkter i denna kollektion.</p>
      )}
    </div>
  );
}
