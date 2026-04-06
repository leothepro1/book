import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { resolveBookingFromToken } from "@/app/(guest)/_lib/portal/resolveBooking";
import { getBookingStatus } from "@/app/(guest)/_lib/booking";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import { ShopProductProvider } from "@/app/(guest)/_lib/product-context/ShopProductProvider";
import { CartProvider } from "@/app/(guest)/_lib/cart/CartContext";
import { ShopProductLayout } from "@/app/(guest)/shop/products/[slug]/ShopProductLayout";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import type { StandardProductContext } from "@/app/(guest)/_lib/product-context/ProductContext";

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

  return (
    <GuestPageShell config={config} pageId="shop-product">
      <CartProvider tenantId={tenantId}>
        <ShopProductProvider product={productContext}>
          <ShopProductLayout />
        </ShopProductProvider>
      </CartProvider>
    </GuestPageShell>
  );
}
