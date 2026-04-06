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

export const revalidate = 60;
export const dynamicParams = true;

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
