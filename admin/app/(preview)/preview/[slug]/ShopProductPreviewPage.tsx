import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getBookingStatus } from "@/app/(guest)/_lib/booking";
import { ThemeRenderer } from "@/app/(guest)/_lib/themes";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { ShopProductProvider } from "@/app/(guest)/_lib/product-context/ShopProductProvider";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import type { StandardProductContext } from "@/app/(guest)/_lib/product-context/ProductContext";
import type { SectionInstance } from "@/app/_lib/sections/types";
import { NO_ACTION } from "@/app/_lib/sections/types";

/**
 * Shop Product preview page for the editor.
 * Handles both "shop-product" (default) and "shop-product.{suffix}" template previews.
 */
export async function ShopProductPreviewPage({
  productId,
  templatePageId,
}: {
  productId?: string;
  templatePageId: string;
}) {
  const booking = await resolveBookingFromToken("preview");
  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen tenant hittades.</div>;
  }

  const tenantId = booking.tenantId ?? "default";
  const locale = await getRequestLocale();
  const config = await getTenantConfig(tenantId, { preferDraft: true, locale });
  const bookingStatus = getBookingStatus(booking);

  // Fetch a product for preview
  const rawProduct = productId
    ? await prisma.product.findFirst({
        where: { id: productId, tenantId, status: "ACTIVE" },
        include: {
          media: { orderBy: { sortOrder: "asc" } },
          options: { orderBy: { sortOrder: "asc" } },
          variants: { orderBy: { sortOrder: "asc" } },
        },
      })
    : await prisma.product.findFirst({
        where: { tenantId, status: "ACTIVE", productType: "STANDARD" },
        orderBy: [{ createdAt: "asc" }],
        include: {
          media: { orderBy: { sortOrder: "asc" } },
          options: { orderBy: { sortOrder: "asc" } },
          variants: { orderBy: { sortOrder: "asc" } },
        },
      });

  if (!rawProduct) {
    return (
      <GuestPageShell config={config} pageId="shop-product">
        <div style={{ padding: 40, textAlign: "center", color: "var(--admin-text-tertiary, #999)", fontSize: 14, lineHeight: 1.6 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 40, display: "block", marginBottom: 12, opacity: 0.3 }}>
            shopping_bag
          </span>
          Välj en produkt för förhandsgranskning
        </div>
      </GuestPageShell>
    );
  }

  const resolved = resolveProduct(rawProduct);

  const productContext: StandardProductContext = {
    tenantId,
    id: resolved.id,
    title: resolved.displayTitle,
    description: resolved.displayDescription,
    slug: resolved.slug,
    images: rawProduct.media.filter((m) => m.type === "image").map((m) => m.url),
    price: resolved.price,
    currency: resolved.currency,
    productType: "STANDARD",
    options: resolved.options,
    variants: resolved.variants,
    compareAtPrice: resolved.compareAtPrice,
    trackInventory: resolved.trackInventory,
    inventoryQuantity: resolved.inventoryQuantity,
    continueSellingWhenOutOfStock: resolved.continueSellingWhenOutOfStock,
  };

  // Fallback sections — uses __standalone wrappers to bypass slot validation.
  // Same pattern as createStandaloneSection() in mutations.ts.
  const FALLBACK_SECTIONS: SectionInstance[] = [
    {
      id: "pv_gallery",
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
    {
      id: "pv_title_sec",
      definitionId: "__standalone",
      definitionVersion: "1.0.0",
      presetKey: "default",
      presetVersion: "1.0.0",
      sortOrder: 1,
      isActive: true,
      settings: {},
      presetSettings: {},
      blocks: [{ id: "pv_title_blk", type: "wrapper", settings: {}, slots: { content: [{ id: "pv_title", type: "product-title", settings: { size: "lg", alignment: "left" }, action: NO_ACTION, sortOrder: 0 }] }, sortOrder: 0, isActive: true }],
    },
    {
      id: "pv_desc_sec",
      definitionId: "__standalone",
      definitionVersion: "1.0.0",
      presetKey: "default",
      presetVersion: "1.0.0",
      sortOrder: 2,
      isActive: true,
      settings: {},
      presetSettings: {},
      blocks: [{ id: "pv_desc_blk", type: "wrapper", settings: {}, slots: { content: [{ id: "pv_desc", type: "product-description", settings: { size: "md", alignment: "left" }, action: NO_ACTION, sortOrder: 0 }] }, sortOrder: 0, isActive: true }],
    },
    {
      id: "pv_price_sec",
      definitionId: "__standalone",
      definitionVersion: "1.0.0",
      presetKey: "default",
      presetVersion: "1.0.0",
      sortOrder: 3,
      isActive: true,
      settings: {},
      presetSettings: {},
      blocks: [{ id: "pv_price_blk", type: "wrapper", settings: {}, slots: { content: [{ id: "pv_price", type: "product-price", settings: { size: "lg" }, action: NO_ACTION, sortOrder: 0 }] }, sortOrder: 0, isActive: true }],
    },
    {
      id: "pv_atc_sec",
      definitionId: "__standalone",
      definitionVersion: "1.0.0",
      presetKey: "default",
      presetVersion: "1.0.0",
      sortOrder: 4,
      isActive: true,
      settings: {},
      presetSettings: {},
      blocks: [{ id: "pv_atc_blk", type: "wrapper", settings: {}, slots: { content: [{ id: "pv_atc", type: "product-add-to-cart", settings: {}, action: NO_ACTION, sortOrder: 0 }] }, sortOrder: 0, isActive: true }],
    },
  ];

  const existingPageConfig = config.pages?.[templatePageId as import("@/app/_lib/pages/types").PageId];
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
    <GuestPageShell config={config} pageId="shop-product">
      <ShopProductProvider product={productContext}>
        <ThemeRenderer
          templateKey={templatePageId}
          config={configForRender}
          booking={booking}
          bookingStatus={bookingStatus}
          token="preview"
        />
      </ShopProductProvider>
    </GuestPageShell>
  );
}
