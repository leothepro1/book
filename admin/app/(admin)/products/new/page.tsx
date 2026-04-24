import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  previewSeoForEntity,
  type SeoPreviewResult,
} from "@/app/_lib/seo/preview";
import { tenantToSeoContext } from "@/app/_lib/tenant/seo-context";
import ProductForm from "../_components/ProductForm";

export const dynamic = "force-dynamic";

/**
 * /products/new — create a new product.
 *
 * Computes an initial SERP preview server-side so the
 * SearchListingEditor renders with the `ny-produkt` placeholder URL
 * on first paint, without a client-side flash. `entityId: null` is
 * the engine's /new marker (M6.3-prep).
 */
export default async function NewProductPage() {
  const tenantData = await getCurrentTenant();

  const initialPreview = tenantData
    ? await safeInitialPreview({
        tenantId: tenantData.tenant.id,
        tenantRow: tenantData.tenant,
      })
    : undefined;

  return <ProductForm initialPreview={initialPreview} />;
}

// ── Helpers ──────────────────────────────────────────────────

type TenantRecord = Awaited<ReturnType<typeof getCurrentTenant>>;

async function safeInitialPreview(args: {
  tenantId: string;
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
      entityId: null,
      overrides: {},
      locale: ctx.defaultLocale,
    });
  } catch (error) {
    log("warn", "seo.preview.initial_failed", {
      tenantId: args.tenantId,
      resourceType: "product",
      entityId: "null",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
