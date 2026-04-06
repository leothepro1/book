import { notFound } from "next/navigation";
import { getProductBySlug, isAccommodationSlug } from "@/app/_lib/products/actions";
import { resolveProductTemplate } from "@/app/_lib/products/template";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { applyTranslations } from "@/app/_lib/translations/apply-db-translations";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { ShopProductProvider } from "@/app/(guest)/_lib/product-context/ShopProductProvider";
import { log } from "@/app/_lib/logger";
import type { StandardProductContext } from "@/app/(guest)/_lib/product-context/ProductContext";
import type { PageId } from "@/app/_lib/pages/types";
import type { SectionInstance } from "@/app/_lib/sections/types";
import { NO_ACTION } from "@/app/_lib/sections/types";

export const revalidate = 60;
export const dynamicParams = true;

/**
 * Fallback sections when no ProductTemplate exists for the tenant.
 * Renders a complete, purchasable product page:
 *   1. product-gallery  — image mosaic with lightbox (locked section, 0 blocks OK)
 *   2–5. Standalone wrappers for title, description, price, add-to-cart
 *
 * Uses __standalone definitionId to bypass the strict validation pipeline.
 * This is the same pattern the editor uses for standalone elements —
 * see createStandaloneSection() in mutations.ts.
 */
const FALLBACK_SECTIONS: SectionInstance[] = [
  // 1. Product gallery — locked section, renders from ProductContext.images
  {
    id: "fallback_gallery",
    definitionId: "product-gallery",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    sortOrder: 0,
    isActive: true,
    settings: {},
    presetSettings: { cornerRadius: 12, gap: 10 },
    blocks: [],
  },
  // 2. Product title — standalone wrapper
  {
    id: "fallback_title",
    definitionId: "__standalone",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    sortOrder: 1,
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [{
      id: "fallback_title_blk",
      type: "wrapper",
      settings: {},
      slots: {
        content: [{ id: "fb_title", type: "product-title", settings: { size: "lg", alignment: "left" }, action: NO_ACTION, sortOrder: 0 }],
      },
      sortOrder: 0,
      isActive: true,
    }],
  },
  // 3. Product description — standalone wrapper
  {
    id: "fallback_desc",
    definitionId: "__standalone",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    sortOrder: 2,
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [{
      id: "fallback_desc_blk",
      type: "wrapper",
      settings: {},
      slots: {
        content: [{ id: "fb_desc", type: "product-description", settings: { size: "md", alignment: "left" }, action: NO_ACTION, sortOrder: 0 }],
      },
      sortOrder: 0,
      isActive: true,
    }],
  },
  // 4. Product price — standalone wrapper
  {
    id: "fallback_price",
    definitionId: "__standalone",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    sortOrder: 3,
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [{
      id: "fallback_price_blk",
      type: "wrapper",
      settings: {},
      slots: {
        content: [{ id: "fb_price", type: "product-price", settings: { size: "lg" }, action: NO_ACTION, sortOrder: 0 }],
      },
      sortOrder: 0,
      isActive: true,
    }],
  },
  // 5. Add to cart — standalone wrapper
  {
    id: "fallback_atc",
    definitionId: "__standalone",
    definitionVersion: "1.0.0",
    presetKey: "default",
    presetVersion: "1.0.0",
    sortOrder: 4,
    isActive: true,
    settings: {},
    presetSettings: {},
    blocks: [{
      id: "fallback_atc_blk",
      type: "wrapper",
      settings: {},
      slots: {
        content: [{ id: "fb_atc", type: "product-add-to-cart", settings: {}, action: NO_ACTION, sortOrder: 0 }],
      },
      sortOrder: 0,
      isActive: true,
    }],
  },
];

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

  // Fetch product via the canonical server action
  // (also resolves tenant from host internally — cached, no double cost)
  const product = await getProductBySlug(slug);
  if (!product) return notFound();

  // Resolve template sections
  const template = await resolveProductTemplate(tenant.id, product);
  if (!template) {
    log("warn", "product.no_template", {
      tenantId: tenant.id,
      productId: product.id,
      slug,
    });
  }
  const templatePageId = template?.pageId ?? "shop-product";

  // Apply locale translations
  const locale = await getRequestLocale();
  const translated = await applyTranslations(
    tenant.id, locale, "product", product.id,
    { title: product.displayTitle, description: product.displayDescription },
    ["title", "description"],
  );

  const config = await getTenantConfig(tenant.id, { locale });

  // Build StandardProductContext from ResolvedProduct (carries options, variants, media)
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

  // Ensure FALLBACK_SECTIONS are available if tenant has no config for this page
  const existingPageConfig = config.pages?.[templatePageId as PageId];
  const configForRender = existingPageConfig?.sections?.length
    ? config
    : {
        ...config,
        pages: {
          ...config.pages,
          [templatePageId]: {
            enabled: true,
            layoutId: "default",
            sections: FALLBACK_SECTIONS,
          },
        },
      };

  return (
    <GuestPageShell config={config}>
      <ShopProductProvider product={productContext}>
        <ThemeRenderer
          templateKey={templatePageId}
          config={configForRender}
        />
      </ShopProductProvider>
    </GuestPageShell>
  );
}
