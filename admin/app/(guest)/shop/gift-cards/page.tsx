import { notFound, redirect } from "next/navigation";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { prisma } from "@/app/_lib/db/prisma";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import Link from "next/link";
import "./gift-card.css";

export const revalidate = 60;

/**
 * Gift Card Listing Page
 * ═════════════════════
 *
 * Shows all enabled gift card products for the tenant.
 * If only one exists, redirects directly to it (Shopify pattern).
 * If none exist, returns 404.
 */
export default async function GiftCardListingPage() {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const products = await prisma.giftCardProduct.findMany({
    where: {
      tenantId: tenant.id,
      enabled: true,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
    include: {
      designs: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { id: true, config: true, renderedImageUrl: true },
      },
      _count: { select: { designs: true } },
    },
  });

  if (products.length === 0) return notFound();

  // Single product — redirect directly (no listing needed)
  if (products.length === 1) {
    redirect(`/shop/gift-cards/${products[0].slug}`);
  }

  // Multiple products — show listing
  return (
    <div className="gc-page">
      <div className="gc-container" style={{ maxWidth: 720 }}>
        <div className="gc-header">
          <h1 className="gc-header__title">Presentkort</h1>
          <p className="gc-header__subtitle">{tenant.name}</p>
        </div>

        <div className="gc-listing">
          {products.map((product) => {
            const firstDesign = product.designs[0];
            const config = (firstDesign?.config ?? {}) as Record<string, unknown>;
            const bgColor = (config.bgColor as string) ?? "#f0f0f0";
            const bgMode = (config.bgMode as string) ?? "fill";
            const bgGradientColor2 = (config.bgGradientColor2 as string) ?? "#000";
            const bgGradientDir = (config.bgGradientDir as string) ?? "down";

            const bgStyle: React.CSSProperties =
              bgMode === "gradient"
                ? { background: `linear-gradient(to ${bgGradientDir === "up" ? "top" : "bottom"}, ${bgColor}, ${bgGradientColor2})` }
                : { background: bgColor };

            return (
              <Link
                key={product.id}
                href={`/shop/gift-cards/${product.slug}`}
                className="gc-listing__card"
              >
                <div className="gc-listing__preview" style={bgStyle}>
                  {firstDesign?.renderedImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={firstDesign.renderedImageUrl}
                      alt={product.title}
                      className="gc-listing__preview-img"
                    />
                  )}
                </div>
                <div className="gc-listing__info">
                  <h2 className="gc-listing__title">{product.title}</h2>
                  <p className="gc-listing__price">
                    Från {formatPriceDisplay(product.minAmount, "SEK")} kr
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
