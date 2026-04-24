"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { revalidatePath, revalidateTag } from "next/cache";
import { log } from "@/app/_lib/logger";
import {
  SeoMetadataSchema,
  safeParseSeoMetadata,
} from "@/app/_lib/seo/types";
import { stripEmptySeoKeys } from "@/app/_lib/seo/strip-empty";
import {
  buildRedirectPath,
  cleanupRedirectsForDeletedEntity,
  collapseAndCreate,
  getTenantDefaultLocale,
} from "@/app/_lib/seo/redirects";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "VERSION_CONFLICT" };

function titleToSlug(title: string): string {
  const MAP: Record<string, string> = { "\u00e5": "a", "\u00e4": "a", "\u00f6": "o", "\u00c5": "a", "\u00c4": "a", "\u00d6": "o" };
  return title.toLowerCase().replace(/[\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6]/g, (c) => MAP[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

async function resolveUniqueSlug(tenantId: string, baseSlug: string, excludeId?: string): Promise<string> {
  const slug = baseSlug || "boendetyp";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const conflict = await prisma.accommodationCategory.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!conflict || conflict.id === excludeId) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

export async function createAccommodationCategory(
  input: { title: string; description?: string; status?: "ACTIVE" | "INACTIVE"; imageUrl?: string | null; accommodationIds?: string[]; visibleInSearch?: boolean; seo?: unknown },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  // SEO at the save boundary — validate + strip empties. Same
  // pattern as updateAccommodation from Batch 2: inline parse
  // rather than a named schema, since the category action doesn't
  // use Zod for anything else today.
  let seoJson: Prisma.InputJsonValue | null = null;
  let seoFieldsChanged = "";
  if (input.seo !== undefined) {
    const parsed = SeoMetadataSchema.partial().safeParse(input.seo);
    if (!parsed.success) {
      log("warn", "seo.entity.seo_invalid", {
        tenantId,
        resourceType: "accommodation_category",
        entityId: "pending",
        reason: parsed.error.message,
      });
      return { ok: false, error: "Ogiltig SEO-data" };
    }
    const stripped = stripEmptySeoKeys(parsed.data);
    if (Object.keys(stripped).length > 0) {
      seoJson = JSON.parse(JSON.stringify(stripped)) as Prisma.InputJsonValue;
      seoFieldsChanged = Object.keys(stripped).join(",");
    }
  }

  const slug = await resolveUniqueSlug(tenantId, titleToSlug(input.title));

  try {
    const cat = await prisma.$transaction(async (tx) => {
      const created = await tx.accommodationCategory.create({
        data: {
          tenantId,
          title: input.title,
          description: input.description ?? "",
          slug,
          imageUrl: input.imageUrl ?? null,
          status: (input.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
          visibleInSearch: input.visibleInSearch ?? true,
          ...(seoJson !== null && { seo: seoJson }),
        },
      });
      if (input.accommodationIds && input.accommodationIds.length > 0) {
        const valid = await tx.accommodation.findMany({
          where: { id: { in: input.accommodationIds }, tenantId },
          select: { id: true },
        });
        const validIds = new Set(valid.map((a) => a.id));
        const memberships = input.accommodationIds
          .filter((id) => validIds.has(id))
          .map((accommodationId, i) => ({ categoryId: created.id, accommodationId, sortOrder: i }));
        if (memberships.length > 0) {
          await tx.accommodationCategoryItem.createMany({ data: memberships });
        }
      }
      return created;
    });

    if (seoFieldsChanged.length > 0) {
      log("info", "seo.entity.seo_created", {
        tenantId,
        resourceType: "accommodation_category",
        entityId: cat.id,
        fieldsChanged: seoFieldsChanged,
      });
    }

    revalidatePath("/accommodation-categories");
    revalidateTag(`accommodation-types:${tenantId}`, { expire: 0 });
    return { ok: true, data: { id: cat.id, slug: cat.slug } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "En boendetyp med denna URL finns redan." };
    }
    throw error;
  }
}

export async function updateAccommodationCategory(
  categoryId: string,
  input: { title?: string; description?: string; status?: "ACTIVE" | "INACTIVE"; imageUrl?: string | null; accommodationIds?: string[]; expectedVersion?: number; visibleInSearch?: boolean; seo?: unknown },
): Promise<ActionResult<{ id: string; slug: string; version: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const existing = await prisma.accommodationCategory.findFirst({
    where: { id: categoryId, tenantId },
    select: { id: true, slug: true, title: true, version: true, seo: true },
  });
  if (!existing) return { ok: false, error: "Boendetypen hittades inte" };

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    return { ok: false, error: "Boendetypen har ändrats. Ladda om.", code: "VERSION_CONFLICT" };
  }

  let slug = existing.slug;
  if (input.title && input.title !== existing.title) {
    slug = await resolveUniqueSlug(tenantId, titleToSlug(input.title), categoryId);
  }

  // SEO: validate + strip + shallow-merge. Same pattern as
  // updateAccommodation from Batch 2 — inline parse (no named
  // schema), strip empties, merge over stored.
  let mergedSeoJson: Prisma.InputJsonValue | undefined;
  let seoFieldsChanged = "";
  if (input.seo !== undefined) {
    const parsed = SeoMetadataSchema.partial().safeParse(input.seo);
    if (!parsed.success) {
      log("warn", "seo.entity.seo_invalid", {
        tenantId,
        resourceType: "accommodation_category",
        entityId: categoryId,
        reason: parsed.error.message,
      });
      return { ok: false, error: "Ogiltig SEO-data" };
    }
    const stripped = stripEmptySeoKeys(parsed.data);
    const existingSeo = safeParseSeoMetadata(existing.seo) ?? {};
    const merged = { ...existingSeo, ...stripped };
    mergedSeoJson = JSON.parse(JSON.stringify(merged)) as Prisma.InputJsonValue;
    seoFieldsChanged = Object.keys(stripped).join(",");
  }

  try {
    const cat = await prisma.$transaction(async (tx) => {
      const updated = await tx.accommodationCategory.update({
        where: { id: categoryId },
        data: {
          ...(input.title !== undefined && { title: input.title, slug }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.visibleInSearch !== undefined && { visibleInSearch: input.visibleInSearch }),
          ...(mergedSeoJson !== undefined && { seo: mergedSeoJson }),
          version: { increment: 1 },
        },
      });

      // SEO redirect when slug changed — same pattern as
      // updateProduct / updateCollection.
      if (input.title && input.title !== existing.title && slug !== existing.slug) {
        const oldPath = buildRedirectPath("accommodation_category", existing.slug);
        const newPath = buildRedirectPath("accommodation_category", slug);
        if (oldPath && newPath && oldPath !== newPath) {
          const locale = await getTenantDefaultLocale(tenantId, tx);
          await collapseAndCreate(tx, {
            tenantId,
            oldPath,
            newPath,
            locale,
          });
          log("info", "seo.redirect.created", {
            tenantId,
            resourceType: "accommodation_category",
            entityId: existing.id,
            oldPath,
            newPath,
            locale,
          });
        }
      }

      if (input.accommodationIds !== undefined) {
        await tx.accommodationCategoryItem.deleteMany({ where: { categoryId } });
        if (input.accommodationIds.length > 0) {
          const valid = await tx.accommodation.findMany({
            where: { id: { in: input.accommodationIds }, tenantId },
            select: { id: true },
          });
          const validIds = new Set(valid.map((a) => a.id));
          const memberships = input.accommodationIds
            .filter((id) => validIds.has(id))
            .map((accommodationId, i) => ({ categoryId, accommodationId, sortOrder: i }));
          if (memberships.length > 0) {
            await tx.accommodationCategoryItem.createMany({ data: memberships });
          }
        }
      }
      return updated;
    });

    if (input.seo !== undefined) {
      log("info", "seo.entity.seo_updated", {
        tenantId,
        resourceType: "accommodation_category",
        entityId: categoryId,
        fieldsChanged: seoFieldsChanged,
      });
    }

    revalidatePath("/accommodation-categories");
    revalidatePath(`/accommodation-categories/${categoryId}`);
    revalidateTag(`accommodation-types:${tenantId}`, { expire: 0 });
    return { ok: true, data: { id: cat.id, slug: cat.slug, version: cat.version } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "En boendetyp med denna URL finns redan." };
    }
    throw error;
  }
}

export async function deleteAccommodationCategory(categoryId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const existing = await prisma.accommodationCategory.findFirst({
    where: { id: categoryId, tenantId },
    select: { id: true, slug: true },
  });
  if (!existing) return { ok: false, error: "Boendetypen hittades inte" };

  const entityPath = buildRedirectPath("accommodation_category", existing.slug);

  const redirectsDeleted = await prisma.$transaction(async (tx) => {
    let count = 0;
    if (entityPath) {
      const locale = await getTenantDefaultLocale(tenantId, tx);
      count = await cleanupRedirectsForDeletedEntity(tx, {
        tenantId,
        entityPath,
        locale,
      });
    }
    await tx.accommodationCategory.delete({ where: { id: categoryId } });
    return count;
  });

  if (redirectsDeleted > 0 && entityPath) {
    log("info", "seo.redirect.cleaned_up_on_delete", {
      tenantId,
      resourceType: "accommodation_category",
      entityId: categoryId,
      path: entityPath,
      redirectsDeleted,
    });
  }

  revalidatePath("/accommodation-categories");
  revalidateTag(`accommodation-types:${tenantId}`, { expire: 0 });
  return { ok: true, data: undefined };
}

export async function listAccommodationCategories() {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  return prisma.accommodationCategory.findMany({
    where: { tenantId: tenantData.tenant.id },
    include: { _count: { select: { items: true } } },
    orderBy: { sortOrder: "asc" },
  });
}

export async function updateAccommodationCategoryAddons(
  categoryId: string,
  collectionIds: string[],
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const existing = await prisma.accommodationCategory.findFirst({
    where: { id: categoryId, tenantId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Boendetypen hittades inte" };

  await prisma.$transaction(async (tx) => {
    await tx.accommodationCategoryAddon.deleteMany({ where: { categoryId } });
    if (collectionIds.length > 0) {
      const valid = await tx.productCollection.findMany({
        where: { id: { in: collectionIds }, tenantId },
        select: { id: true },
      });
      const validIds = new Set(valid.map((c) => c.id));
      const links = collectionIds
        .filter((id) => validIds.has(id))
        .map((collectionId, i) => ({ categoryId, collectionId, sortOrder: i }));
      if (links.length > 0) {
        await tx.accommodationCategoryAddon.createMany({ data: links });
      }
    }
  });

  revalidatePath(`/accommodation-categories/${categoryId}`);
  return { ok: true, data: undefined };
}

export async function searchProductCollections(query: string) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  return prisma.productCollection.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      status: "ACTIVE",
      ...(query ? {
        title: { contains: query, mode: "insensitive" as const },
      } : {}),
    },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      status: true,
      _count: { select: { items: true } },
    },
    take: 20,
    orderBy: { title: "asc" },
  });
}

export async function searchAccommodations(query: string) {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  return prisma.accommodation.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      archivedAt: null,
      ...(query ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { nameOverride: { contains: query, mode: "insensitive" as const } },
          { slug: { contains: query, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    select: {
      id: true,
      name: true,
      nameOverride: true,
      status: true,
      accommodationType: true,
      media: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
    take: 20,
    orderBy: { name: "asc" },
  });
}
