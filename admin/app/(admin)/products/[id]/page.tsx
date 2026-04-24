import { getProduct } from "@/app/_lib/products";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { notFound } from "next/navigation";
import {
  previewSeoForEntity,
  type SeoPreviewResult,
} from "@/app/_lib/seo/preview";
import { safeParseSeoMetadata } from "@/app/_lib/seo/types";
import { tenantToSeoContext } from "@/app/_lib/tenant/seo-context";
import ProductForm from "../_components/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) notFound();

  const product = await getProduct(id);
  if (!product) notFound();

  // Serialize dates for client component
  const serialized = JSON.parse(JSON.stringify(product));

  // ── SEO: extract stored overrides + compute initial preview ──
  //
  // `getProduct` returns the raw Prisma row so `product.seo` is
  // already on the object, but `ExistingProduct` doesn't type it.
  // Parse-at-boundary keeps the form's typed prop tight.
  const storedSeo = safeParseSeoMetadata(
    (product as unknown as { seo?: unknown }).seo,
  );
  const seoProp = storedSeo
    ? {
        title: storedSeo.title ?? "",
        description: storedSeo.description ?? "",
      }
    : { title: "", description: "" };

  const initialPreview = await safeInitialPreview({
    tenantId: tenantData.tenant.id,
    entityId: product.id,
    overrides: storedSeo ?? {},
    tenantRow: tenantData.tenant,
  });

  return (
    <ProductForm
      product={serialized}
      seo={seoProp}
      initialPreview={initialPreview}
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────

type TenantRecord = Awaited<ReturnType<typeof getCurrentTenant>>;

/**
 * Call the preview engine with the tenant's default locale. Any
 * failure is logged + swallowed; the form renders with its own
 * fallback shell until the first debounced client refresh settles.
 * Never 500 the page for an SEO-preview hiccup.
 */
async function safeInitialPreview(args: {
  tenantId: string;
  entityId: string | null;
  overrides: Record<string, unknown>;
  tenantRow: NonNullable<TenantRecord>["tenant"];
}): Promise<SeoPreviewResult | undefined> {
  try {
    const locales = await prisma.tenantLocale.findMany({
      where: { tenantId: args.tenantId },
    });
    const ctx = tenantToSeoContext({ tenant: args.tenantRow, locales });
    return await previewSeoForEntity({
      tenantId: args.tenantId,
      resourceType: "product",
      entityId: args.entityId,
      overrides: args.overrides,
      locale: ctx.defaultLocale,
    });
  } catch (error) {
    log("warn", "seo.preview.initial_failed", {
      tenantId: args.tenantId,
      resourceType: "product",
      entityId: args.entityId ?? "null",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
