import { notFound } from "next/navigation";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { prisma } from "@/app/_lib/db/prisma";
import { applyTranslations } from "@/app/_lib/translations/apply-db-translations";
import { GiftCardPurchaseClient } from "./GiftCardPurchaseClient";

export const revalidate = 60;
export const dynamicParams = true;

/**
 * Gift Card Product Page
 * ══════════════════════
 *
 * Server component that resolves a specific gift card product by slug,
 * validates it's enabled and has designs, then passes sanitized data
 * to the client purchase flow.
 *
 * Pattern: identical to checkout/page.tsx — server resolves authoritative
 * data, client never fetches product info.
 */

export type GiftCardProductData = {
  id: string;
  title: string;
  description: string;
  tenantName: string;
  minAmount: number;
  maxAmount: number;
  designs: GiftCardDesignClientData[];
};

export type GiftCardDesignClientData = {
  id: string;
  name: string;
  imageUrl: string;
  renderedImageUrl: string | null;
  config: {
    logoUrl: string;
    bgMode: string;
    bgColor: string;
    bgGradientColor2: string;
    bgGradientDir: string;
  };
};

export default async function GiftCardProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const product = await prisma.giftCardProduct.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
    include: {
      designs: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          renderedImageUrl: true,
          config: true,
        },
      },
    },
  });

  if (!product) return notFound();
  if (!product.enabled || product.status !== "ACTIVE") return notFound();
  if (product.designs.length === 0) return notFound();

  // Apply locale translations
  const locale = await getRequestLocale();
  const translated = await applyTranslations(
    tenant.id, locale, "gift-card", product.id,
    { title: product.title, description: product.description },
    ["title", "description"],
  );

  // Sanitize — never pass raw Prisma objects to client
  const data: GiftCardProductData = {
    id: product.id,
    title: translated.title as string,
    description: translated.description as string,
    tenantName: tenant.name,
    minAmount: product.minAmount,
    maxAmount: product.maxAmount,
    designs: product.designs.map((d) => {
      const raw = (d.config ?? {}) as Record<string, unknown>;
      return {
        id: d.id,
        name: d.name,
        imageUrl: d.imageUrl,
        renderedImageUrl: d.renderedImageUrl,
        config: {
          logoUrl: (raw.logoUrl as string) ?? "",
          bgMode: (raw.bgMode as string) ?? "fill",
          bgColor: (raw.bgColor as string) ?? "#FFFFFF",
          bgGradientColor2: (raw.bgGradientColor2 as string) ?? "#000000",
          bgGradientDir: (raw.bgGradientDir as string) ?? "down",
        },
      };
    }),
  };

  return <GiftCardPurchaseClient product={data} />;
}
