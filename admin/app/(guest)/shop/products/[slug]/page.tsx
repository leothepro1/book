import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, isAccommodationSlug } from "@/app/_lib/products/actions";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { applyTranslations } from "@/app/_lib/translations/apply-db-translations";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { ShopProductProvider } from "@/app/(guest)/_lib/product-context/ShopProductProvider";
import { ShopProductLayout } from "./ShopProductLayout";
import type { StandardProductContext } from "@/app/(guest)/_lib/product-context/ProductContext";
import { toNextMetadata } from "@/app/_lib/seo/next-metadata";
import { resolveSeoForRequest } from "@/app/_lib/seo/request-cache";

export const revalidate = 60;
export const dynamicParams = true;

// ── SEO metadata ──────────────────────────────────────────────
//
// Runs before the page body. Not-found tenants/products return a
// noindex stub — never throw from generateMetadata (Next would
// 500 the whole request).
//
// Accommodation-slug collision: when the slug belongs to an
// Accommodation the page body redirects to `/stays/[slug]`.
// Metadata is never rendered for a redirected request, but we
// still return a noindex stub defensively so Google can't index
// `/shop/products/{accommodation-slug}` if the redirect is ever
// removed.
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

  if (await isAccommodationSlug(slug)) {
    return { title: "Not found", robots: { index: false } };
  }

  const locale = await getRequestLocale();
  const resolved = await resolveSeoForRequest(
    tenant.id,
    slug,
    locale,
    "product",
  );
  if (!resolved) {
    return { title: "Not found", robots: { index: false } };
  }

  return toNextMetadata(resolved);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  // Check if this slug matches an Accommodation — redirect to /stays/[slug]
  if (await isAccommodationSlug(slug)) {
    const { redirect } = await import("next/navigation");
    redirect(`/stays/${slug}`);
  }

  const product = await getProductBySlug(slug);
  if (!product) return notFound();

  // Apply locale translations
  const locale = await getRequestLocale();
  const translated = await applyTranslations(
    tenant.id, locale, "product", product.id,
    { title: product.displayTitle, description: product.displayDescription },
    ["title", "description"],
  );

  const config = await getTenantConfig(tenant.id, { locale });

  const productContext: StandardProductContext = {
    tenantId: tenant.id,
    id: product.id,
    title: translated.title as string,
    description: translated.description as string,
    slug: product.slug,
    images: product.media.filter((m) => m.type === "image").map((m) => m.url),
    price: product.price,
    currency: product.currency,
    productType: "STANDARD",
    options: product.options,
    variants: product.variants,
    compareAtPrice: product.compareAtPrice,
    trackInventory: product.trackInventory,
    inventoryQuantity: product.inventoryQuantity,
    continueSellingWhenOutOfStock: product.continueSellingWhenOutOfStock,
  };

  return (
    <GuestPageShell config={config}>
      <ShopProductProvider product={productContext}>
        <ShopProductLayout />
      </ShopProductProvider>
    </GuestPageShell>
  );
}
