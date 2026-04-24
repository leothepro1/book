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
import CollectionForm from "../_components/CollectionForm";

export const dynamic = "force-dynamic";

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantData = await getCurrentTenant();
  if (!tenantData) notFound();

  const collection = await prisma.productCollection.findFirst({
    where: { id, tenantId: tenantData.tenant.id },
    include: {
      items: {
        include: { product: { select: { id: true, title: true, media: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!collection) notFound();

  // ── SEO: extract stored overrides + compute initial preview ──
  // Parse-at-boundary pattern: widen neither ExistingCollection
  // (client-side) nor the raw Prisma select shape — just extract
  // the `seo` JSONB at the page boundary and pass it as a
  // separate typed prop to the form.
  const storedSeo = safeParseSeoMetadata(
    (collection as unknown as { seo?: unknown }).seo,
  );
  const seoProp = storedSeo
    ? {
        title: storedSeo.title ?? "",
        description: storedSeo.description ?? "",
      }
    : { title: "", description: "" };

  const initialPreview = await safeInitialPreview({
    tenantId: tenantData.tenant.id,
    entityId: collection.id,
    overrides: storedSeo ?? {},
    tenantRow: tenantData.tenant,
  });

  const serialized = JSON.parse(JSON.stringify(collection));
  return (
    <CollectionForm
      collection={serialized}
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
      resourceType: "product_collection",
      entityId: args.entityId,
      overrides: args.overrides,
      locale: ctx.defaultLocale,
    });
  } catch (error) {
    log("warn", "seo.preview.initial_failed", {
      tenantId: args.tenantId,
      resourceType: "product_collection",
      entityId: args.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
