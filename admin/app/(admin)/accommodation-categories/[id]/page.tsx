import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { log } from "@/app/_lib/logger";
import {
  previewSeoForEntity,
  type SeoPreviewResult,
} from "@/app/_lib/seo/preview";
import { safeParseSeoMetadata } from "@/app/_lib/seo/types";
import { tenantToSeoContext } from "@/app/_lib/tenant/seo-context";
import AccommodationCategoryForm from "../_components/AccommodationCategoryForm";

export const dynamic = "force-dynamic";

export default async function EditAccommodationCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) notFound();

  const category = await prisma.accommodationCategory.findFirst({
    where: { id, tenantId: tenantData.tenant.id },
    include: {
      items: {
        include: {
          accommodation: {
            select: {
              id: true,
              name: true,
              nameOverride: true,
              status: true,
              accommodationType: true,
              media: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      addonCollections: {
        orderBy: { sortOrder: "asc" },
        select: {
          collectionId: true,
          sortOrder: true,
          collection: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              status: true,
              _count: { select: { items: true } },
            },
          },
        },
      },
    },
  });

  if (!category) notFound();

  const initialAddonCollections = category.addonCollections.map((ac) => ({
    id: ac.collection.id,
    title: ac.collection.title,
    imageUrl: ac.collection.imageUrl,
    status: ac.collection.status,
    productCount: ac.collection._count.items,
  }));

  // ── SEO: extract stored overrides + compute initial preview ──
  const storedSeo = safeParseSeoMetadata(
    (category as unknown as { seo?: unknown }).seo,
  );
  const seoProp = storedSeo
    ? {
        title: storedSeo.title ?? "",
        description: storedSeo.description ?? "",
        noindex: storedSeo.noindex ?? false,
      }
    : { title: "", description: "", noindex: false };

  const initialPreview = await safeInitialPreview({
    tenantId: tenantData.tenant.id,
    entityId: category.id,
    overrides: storedSeo ?? {},
    tenantRow: tenantData.tenant,
  });

  const serialized = JSON.parse(JSON.stringify(category));
  return (
    <AccommodationCategoryForm
      category={serialized}
      initialAddonCollections={initialAddonCollections}
      seo={seoProp}
      initialPreview={initialPreview}
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────

type TenantRecord = Awaited<ReturnType<typeof getCurrentTenant>>;

async function safeInitialPreview(args: {
  tenantId: string;
  entityId: string;
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
      resourceType: "accommodation_category",
      entityId: args.entityId,
      overrides: args.overrides,
      locale: ctx.defaultLocale,
    });
  } catch (error) {
    log("warn", "seo.preview.initial_failed", {
      tenantId: args.tenantId,
      resourceType: "accommodation_category",
      entityId: args.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
