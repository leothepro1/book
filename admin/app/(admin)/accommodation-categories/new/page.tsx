import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  previewSeoForEntity,
  type SeoPreviewResult,
} from "@/app/_lib/seo/preview";
import { tenantToSeoContext } from "@/app/_lib/tenant/seo-context";
import AccommodationCategoryForm from "../_components/AccommodationCategoryForm";

export const dynamic = "force-dynamic";

/**
 * /accommodation-categories/new — create a new boendetyp.
 *
 * SSR-computes the initial SearchListingEditor preview with the
 * `ny-boendekategori` placeholder URL so there's no flash.
 */
export default async function NewAccommodationCategoryPage() {
  const tenantData = await getCurrentTenant();

  const initialPreview = tenantData
    ? await safeInitialPreview({
        tenantId: tenantData.tenant.id,
        tenantRow: tenantData.tenant,
      })
    : undefined;

  return <AccommodationCategoryForm initialPreview={initialPreview} />;
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
      resourceType: "accommodation_category",
      entityId: null,
      overrides: {},
      locale: ctx.defaultLocale,
    });
  } catch (error) {
    log("warn", "seo.preview.initial_failed", {
      tenantId: args.tenantId,
      resourceType: "accommodation_category",
      entityId: "null",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
