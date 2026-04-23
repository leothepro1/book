/**
 * CatalogService — tenant-scoped CRUD for B2B catalogs and their children.
 *
 * A Catalog holds the pricing rules that modify base product prices for
 * buyers at one or more CompanyLocations. It has three kinds of child rows:
 *
 *   - CatalogFixedPrice      — flat override of a specific variant's unit price
 *   - CatalogQuantityRule    — min/max/increment + optional volume tier ladder
 *   - CatalogInclusion       — scope rows when includeAllProducts = false
 *
 * B2B catalog rules apply only to products (FAS 6.2B):
 *   - setFixedPrice / setQuantityRule: variant-only
 *   - addInclusion: variant | collection (2-way XOR)
 *
 * Accommodation pricing is PMS-authoritative and never flows through this
 * service — see Pass 3 Risk #8 and computeAccommodationLinePrice
 * (app/_lib/pricing/line-pricing.ts).
 *
 * Mutating catalog rules here does NOT touch existing Orders: prices are
 * snapshotted into OrderLineItem at checkout (FAS 4). Historical orders
 * therefore remain stable when rules change.
 *
 * Partial unique indexes enforce one rule per (catalog, target) pair. The
 * inclusion XOR (variant | collection) is enforced in normaliseInclusionRef
 * at the service boundary since Prisma DSL can't express a cross-column
 * CHECK.
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
 * XOR the inclusion reference into (productVariantId | collectionId)
 * columns. Enforced here because Prisma DSL can't express a cross-column
 * CHECK constraint on the polymorphic shape.
 *
 * Fixed-price and quantity-rule paths no longer need normalisation —
 * ProductRef is variant-only, so callers use `params.productRef.id`
 * directly for the productVariantId column.
 */
function normaliseInclusionRef(ref: InclusionRef): {
  productVariantId: string | null;
  collectionId: string | null;
} {
  const variant = ref.type === "variant" ? ref.id : null;
  const coll = ref.type === "collection" ? ref.id : null;

  const setCount = [variant, coll].filter((x) => x !== null).length;
  if (setCount !== 1) {
    throw new ValidationError(
      "Exactly one of variant/collection must be set",
      { polymorphicXor: "XOR_VIOLATION" },
    );
  }
  return {
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
  const productVariantId = params.productRef.id;

  // Race-safe upsert: if two callers see `existing === null` at the same
  // time, the loser hits the partial unique index and we re-run the closure
  // which will then observe the winner's row and take the update path.
  const row = await upsertWithRaceRetry(() =>
    prisma.$transaction(async (tx) => {
      await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);

      // Upsert semantics: one row per (catalogId, productVariantId).
      const existing = await tx.catalogFixedPrice.findFirst({
        where: {
          catalogId: params.catalogId,
          productVariantId,
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
          productVariantId,
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
  const productVariantId = params.productRef.id;

  // Race-safe upsert against the partial unique index on
  // (catalogId, productVariantId).
  const row = await upsertWithRaceRetry(() =>
    prisma.$transaction(async (tx) => {
      await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);

      const existing = await tx.catalogQuantityRule.findFirst({
        where: {
          catalogId: params.catalogId,
          productVariantId,
        },
      });
      const data = {
        catalogId: params.catalogId,
        productVariantId,
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
  const ref = normaliseInclusionRef(params.productRef);

  // Race-safe upsert: under concurrent callers, the loser of the create
  // race hits the partial unique index on the set polymorphic column.
  const row = await upsertWithRaceRetry(() =>
    prisma.$transaction(async (tx) => {
      await assertCatalogInTenantInTx(tx, params.tenantId, params.catalogId);
      const existing = await tx.catalogInclusion.findFirst({
        where: {
          catalogId: params.catalogId,
          productVariantId: ref.productVariantId,
          collectionId: ref.collectionId,
        },
      });
      if (existing) return existing;
      return tx.catalogInclusion.create({
        data: {
          catalogId: params.catalogId,
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
