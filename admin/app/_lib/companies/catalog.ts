/**
 * CatalogService — tenant-scoped CRUD for B2B catalogs and their children.
 *
 * A Catalog holds the pricing rules that modify base product prices for
 * buyers at one or more CompanyLocations. It has three kinds of child rows:
 *
 *   - CatalogFixedPrice      — flat override of a specific product's unit price
 *   - CatalogQuantityRule    — min/max/increment + optional volume tier ladder
 *   - CatalogInclusion       — scope rows when includeAllProducts = false
 *
 * Mutating catalog rules here does NOT touch existing Orders: prices are
 * snapshotted into OrderLineItem at checkout (FAS 4). Historical orders
 * therefore remain stable when rules change.
 *
 * Polymorphic-XOR: FAS 1 could not express a CHECK constraint on the
 * (accommodationId, productVariantId, collectionId) triplet. The XOR rule is
 * enforced here at the service boundary — see normaliseProductRef().
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import {
  upsertWithRaceRetry,
  withTranslatedErrors,
} from "../db/prisma-error-translator";
import {
  AddInclusionInputSchema,
  CreateCatalogInputSchema,
  ListCatalogsInputSchema,
  SetFixedPriceInputSchema,
  SetQuantityRuleInputSchema,
  UpdateCatalogPatchSchema,
  type AddInclusionInput,
  type Catalog,
  type CatalogFixedPrice,
  type CatalogInclusion,
  type CatalogQuantityRule,
  type CreateCatalogInput,
  type InclusionRef,
  type ListCatalogsInput,
  type ProductRef,
  type SetFixedPriceInput,
  type SetQuantityRuleInput,
  type UpdateCatalogPatch,
  type VolumePricingTier,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Throw NotFoundError if the catalog does not belong to the tenant.
 * Returns the catalog row to avoid a second fetch for callers.
 */
async function assertCatalogInTenant(
  tenantId: string,
  catalogId: string,
): Promise<Catalog> {
  const catalog = await prisma.catalog.findFirst({
    where: { id: catalogId, tenantId },
  });
  if (!catalog) {
    throw new NotFoundError("Catalog not found in tenant", {
      catalogId,
      tenantId,
    });
  }
  return catalog;
}

/**
 * XOR the polymorphic reference into (accommodationId | productVariantId |
 * collectionId) columns. `allowCollection` distinguishes fixed-price /
 * quantity-rule refs (type = accommodation|variant only) from inclusion refs
 * (also accepts collection).
 */
function normaliseProductRef(
  ref: ProductRef | InclusionRef,
  allowCollection: boolean,
): {
  accommodationId: string | null;
  productVariantId: string | null;
  collectionId: string | null;
} {
  const acc = ref.type === "accommodation" ? ref.id : null;
  const variant = ref.type === "variant" ? ref.id : null;
  const coll =
    ref.type === "collection" && allowCollection ? ref.id : null;

  if (ref.type === "collection" && !allowCollection) {
    throw new ValidationError("collection ref is not allowed here", {
      polymorphicXor: "REF_TYPE_NOT_ALLOWED",
    });
  }

  const setCount = [acc, variant, coll].filter((x) => x !== null).length;
  if (setCount !== 1) {
    throw new ValidationError(
      "Exactly one of accommodation/variant/collection must be set",
      { polymorphicXor: "XOR_VIOLATION" },
    );
  }
  return {
    accommodationId: acc,
    productVariantId: variant,
    collectionId: coll,
  };
}

function toAdjustmentDecimal(
  value: number | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

// ── Catalog CRUD ────────────────────────────────────────────────

export async function createCatalog(
  input: CreateCatalogInput,
): Promise<Catalog> {
  const params = CreateCatalogInputSchema.parse(input);

  const catalog = await withTranslatedErrors(() =>
    prisma.catalog.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        status: params.status ?? "ACTIVE",
        includeAllProducts: params.includeAllProducts ?? true,
        overallAdjustmentPercent: toAdjustmentDecimal(
          params.overallAdjustmentPercent ?? null,
        ),
      },
    }),
  );

  log("info", "catalog.created", {
    tenantId: params.tenantId,
    catalogId: catalog.id,
  });
  return catalog;
}

export async function getCatalog(params: {
  tenantId: string;
  catalogId: string;
}): Promise<
  | (Catalog & {
      fixedPrices: CatalogFixedPrice[];
      quantityRules: CatalogQuantityRule[];
      inclusions: CatalogInclusion[];
    })
  | null
> {
  return prisma.catalog.findFirst({
    where: { id: params.catalogId, tenantId: params.tenantId },
    include: { fixedPrices: true, quantityRules: true, inclusions: true },
  });
}

export async function listCatalogs(
  input: ListCatalogsInput,
): Promise<{ catalogs: Catalog[]; nextCursor: string | null }> {
  const params = ListCatalogsInputSchema.parse(input);
  const search = params.search?.trim();
  const where: Prisma.CatalogWhereInput = {
    tenantId: params.tenantId,
    ...(params.status ? { status: params.status } : {}),
    ...(search
      ? { name: { contains: search, mode: "insensitive" } }
      : {}),
  };
  const rows = await prisma.catalog.findMany({
    where,
    take: params.take + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > params.take;
  const catalogs = hasMore ? rows.slice(0, params.take) : rows;
  return {
    catalogs,
    nextCursor: hasMore ? catalogs[catalogs.length - 1].id : null,
  };
}

export async function updateCatalog(params: {
  tenantId: string;
  catalogId: string;
  patch: UpdateCatalogPatch;
}): Promise<Catalog> {
  const patch = UpdateCatalogPatchSchema.parse(params.patch);

  const res = await prisma.catalog.updateMany({
    where: { id: params.catalogId, tenantId: params.tenantId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.includeAllProducts !== undefined
        ? { includeAllProducts: patch.includeAllProducts }
        : {}),
      ...(patch.overallAdjustmentPercent !== undefined
        ? {
            overallAdjustmentPercent: toAdjustmentDecimal(
              patch.overallAdjustmentPercent,
            ),
          }
        : {}),
    },
  });
  if (res.count === 0) {
    throw new NotFoundError("Catalog not found in tenant", {
      catalogId: params.catalogId,
      tenantId: params.tenantId,
    });
  }
  log("info", "catalog.updated", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
  });
  return (await assertCatalogInTenant(params.tenantId, params.catalogId));
}

async function setCatalogStatus(
  params: { tenantId: string; catalogId: string },
  status: "ACTIVE" | "DRAFT",
): Promise<Catalog> {
  return updateCatalog({ ...params, patch: { status } });
}

export function activateCatalog(params: {
  tenantId: string;
  catalogId: string;
}): Promise<Catalog> {
  return setCatalogStatus(params, "ACTIVE");
}

export function archiveCatalog(params: {
  tenantId: string;
  catalogId: string;
}): Promise<Catalog> {
  // "Archive" in the spec maps to DRAFT on the CatalogStatus enum —
  // the enum has no ARCHIVED value (FAS 1 schema).
  return setCatalogStatus(params, "DRAFT");
}

export async function deleteCatalog(params: {
  tenantId: string;
  catalogId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const catalog = await tx.catalog.findFirst({
      where: { id: params.catalogId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!catalog) {
      throw new NotFoundError("Catalog not found in tenant", {
        catalogId: params.catalogId,
        tenantId: params.tenantId,
      });
    }
    const assignmentCount = await tx.companyLocationCatalog.count({
      where: { catalogId: params.catalogId },
    });
    if (assignmentCount > 0) {
      throw new ValidationError(
        "Catalog is assigned to one or more locations and cannot be deleted",
        { catalogId: params.catalogId, code: "CATALOG_IN_USE", assignmentCount },
      );
    }
    // Prisma onDelete: Cascade cleans up fixedPrices / quantityRules /
    // inclusions via the FK on their catalog relation.
    await tx.catalog.delete({ where: { id: params.catalogId } });
  });
  log("info", "catalog.deleted", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
  });
}

// ── Fixed Prices ────────────────────────────────────────────────

export async function setFixedPrice(
  input: SetFixedPriceInput,
): Promise<CatalogFixedPrice> {
  const params = SetFixedPriceInputSchema.parse(input);
  const ref = normaliseProductRef(params.productRef, false);

  // Race-safe upsert: if two callers see `existing === null` at the same
  // time, the loser hits the partial unique index and we re-run the closure
  // which will then observe the winner's row and take the update path.
  const row = await upsertWithRaceRetry(() =>
    prisma.$transaction(async (tx) => {
      await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);

      // Upsert semantics: one row per (catalogId, productRef).
      const existing = await tx.catalogFixedPrice.findFirst({
        where: {
          catalogId: params.catalogId,
          accommodationId: ref.accommodationId,
          productVariantId: ref.productVariantId,
        },
      });
      if (existing) {
        return tx.catalogFixedPrice.update({
          where: { id: existing.id },
          data: { fixedPriceCents: params.fixedPriceCents },
        });
      }
      return tx.catalogFixedPrice.create({
        data: {
          catalogId: params.catalogId,
          accommodationId: ref.accommodationId,
          productVariantId: ref.productVariantId,
          fixedPriceCents: params.fixedPriceCents,
        },
      });
    }),
  );

  log("info", "catalog.fixed_price_set", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
    fixedPriceId: row.id,
  });
  return row;
}

export async function removeFixedPrice(params: {
  tenantId: string;
  catalogId: string;
  fixedPriceId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);
    const res = await tx.catalogFixedPrice.deleteMany({
      where: { id: params.fixedPriceId, catalogId: params.catalogId },
    });
    if (res.count === 0) {
      throw new NotFoundError("Fixed price not found on this catalog", {
        fixedPriceId: params.fixedPriceId,
        catalogId: params.catalogId,
      });
    }
  });
  log("info", "catalog.fixed_price_removed", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
    fixedPriceId: params.fixedPriceId,
  });
}

// ── Quantity Rules ──────────────────────────────────────────────

export async function setQuantityRule(
  input: SetQuantityRuleInput,
): Promise<CatalogQuantityRule> {
  const params = SetQuantityRuleInputSchema.parse(input);
  const ref = normaliseProductRef(params.productRef, false);

  // Race-safe upsert against the partial unique index on (catalogId, ref).
  const row = await upsertWithRaceRetry(() =>
    prisma.$transaction(async (tx) => {
      await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);

      const existing = await tx.catalogQuantityRule.findFirst({
        where: {
          catalogId: params.catalogId,
          accommodationId: ref.accommodationId,
          productVariantId: ref.productVariantId,
        },
      });
      const data = {
        catalogId: params.catalogId,
        accommodationId: ref.accommodationId,
        productVariantId: ref.productVariantId,
        minQuantity: params.minQuantity ?? null,
        maxQuantity: params.maxQuantity ?? null,
        increment: params.increment ?? null,
        volumePricing:
          params.volumePricing != null
            ? (params.volumePricing as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      };
      if (existing) {
        return tx.catalogQuantityRule.update({
          where: { id: existing.id },
          data,
        });
      }
      return tx.catalogQuantityRule.create({ data });
    }),
  );

  log("info", "catalog.quantity_rule_set", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
    ruleId: row.id,
  });
  return row;
}

export async function removeQuantityRule(params: {
  tenantId: string;
  catalogId: string;
  ruleId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);
    const res = await tx.catalogQuantityRule.deleteMany({
      where: { id: params.ruleId, catalogId: params.catalogId },
    });
    if (res.count === 0) {
      throw new NotFoundError("Quantity rule not found on this catalog", {
        ruleId: params.ruleId,
        catalogId: params.catalogId,
      });
    }
  });
}

// ── Inclusions ──────────────────────────────────────────────────

export async function addInclusion(
  input: AddInclusionInput,
): Promise<CatalogInclusion> {
  const params = AddInclusionInputSchema.parse(input);
  const ref = normaliseProductRef(params.productRef, true);

  // Race-safe upsert: under concurrent callers, the loser of the create
  // race hits the partial unique index on the set polymorphic column.
  const row = await upsertWithRaceRetry(() =>
    prisma.$transaction(async (tx) => {
      await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);
      const existing = await tx.catalogInclusion.findFirst({
        where: {
          catalogId: params.catalogId,
          accommodationId: ref.accommodationId,
          productVariantId: ref.productVariantId,
          collectionId: ref.collectionId,
        },
      });
      if (existing) return existing;
      return tx.catalogInclusion.create({
        data: {
          catalogId: params.catalogId,
          accommodationId: ref.accommodationId,
          productVariantId: ref.productVariantId,
          collectionId: ref.collectionId,
        },
      });
    }),
  );

  log("info", "catalog.inclusion_added", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
    inclusionId: row.id,
  });
  return row;
}

export async function removeInclusion(params: {
  tenantId: string;
  catalogId: string;
  inclusionId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);
    const res = await tx.catalogInclusion.deleteMany({
      where: { id: params.inclusionId, catalogId: params.catalogId },
    });
    if (res.count === 0) {
      throw new NotFoundError("Inclusion not found on this catalog", {
        inclusionId: params.inclusionId,
        catalogId: params.catalogId,
      });
    }
  });
}

// ── tx-scoped helpers ───────────────────────────────────────────

async function assertCatalogInTenantInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  catalogId: string,
): Promise<void> {
  const c = await tx.catalog.findFirst({
    where: { id: catalogId, tenantId },
    select: { id: true },
  });
  if (!c) {
    throw new NotFoundError("Catalog not found in tenant", {
      catalogId,
      tenantId,
    });
  }
}

// Re-export the volume-tier type so pricing code can parse JSON payloads.
export type { VolumePricingTier };
