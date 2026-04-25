import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { notFound } from "next/navigation";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import { log } from "@/app/_lib/logger";
import {
  previewSeoForEntity,
  type SeoPreviewResult,
} from "@/app/_lib/seo/preview";
import { safeParseSeoMetadata } from "@/app/_lib/seo/types";
import { tenantToSeoContext } from "@/app/_lib/tenant/seo-context";
import AccommodationForm from "./AccommodationForm";

export const dynamic = "force-dynamic";

export default async function AccommodationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) return notFound();

  const tenantId = tenantData.tenant.id;

  const row = await prisma.accommodation.findFirst({
    where: { id, tenantId, archivedAt: null },
    select: ACCOMMODATION_SELECT,
  });

  if (!row) return notFound();

  const accommodation = resolveAccommodation(
    row as unknown as AccommodationWithRelations,
  );

  // ── SEO: extract stored overrides + compute initial preview ──
  //
  // `resolveAccommodation()` doesn't propagate the `seo` JSONB column
  // into `ResolvedAccommodation`, so we parse it separately here and
  // pass both the typed overrides and the SSR-rendered preview to
  // the client form. This avoids a client-side preview flash on
  // first render: `SearchListingEditor` seeds its `latestPreview`
  // state directly from `initialPreview`.
  const seoOverrides = safeParseSeoMetadata(row.seo);

  const serialized = JSON.parse(JSON.stringify(accommodation));
  const serializedSeo = seoOverrides
    ? {
        title: seoOverrides.title ?? "",
        description: seoOverrides.description ?? "",
        noindex: seoOverrides.noindex ?? false,
      }
    : { title: "", description: "", noindex: false };

  const initialPreview = await safePreview({
    tenantId,
    entityId: accommodation.id,
    overrides: seoOverrides ?? {},
    tenantLocale: tenantData.tenant,
  });

  return (
    <AccommodationForm
      accommodation={serialized}
      tenantId={tenantId}
      seo={serializedSeo}
      initialPreview={initialPreview}
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────

type TenantRecord = Awaited<ReturnType<typeof getCurrentTenant>>;

/**
 * Call the preview engine with the tenant's default locale. Any
 * failure is logged + swallowed; the form then renders with its
 * own fallback shell until the first debounced client refresh
 * settles. Never 500 the page for an SEO-preview hiccup.
 */
async function safePreview(args: {
  tenantId: string;
  entityId: string;
  overrides: Record<string, unknown>;
  tenantLocale: NonNullable<TenantRecord>["tenant"];
}): Promise<SeoPreviewResult | undefined> {
  try {
    const locales = await prisma.tenantLocale.findMany({
      where: { tenantId: args.tenantId },
    });
    const ctx = tenantToSeoContext({ tenant: args.tenantLocale, locales });
    return await previewSeoForEntity({
      tenantId: args.tenantId,
      resourceType: "accommodation",
      entityId: args.entityId,
      overrides: args.overrides,
      locale: ctx.defaultLocale,
    });
  } catch (error) {
    log("warn", "seo.preview.initial_failed", {
      tenantId: args.tenantId,
      resourceType: "accommodation",
      entityId: args.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
