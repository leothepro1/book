/**
 * B2B PricingResolver — deterministic per-unit price resolution that honours
 * the catalog rules attached to a CompanyLocation.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Contract
 * ───────────────────────────────────────────────────────────────────────────
 *
 * • Scope: VARIANTS ONLY (FAS 6.2B). Accommodation pricing is
 *   PMS-authoritative and comes exclusively from
 *   computeAccommodationLinePrice (app/_lib/pricing/line-pricing.ts).
 *   B2B catalogs never affect accommodation prices — see Pass 3 Risk #8.
 *
 * • Pure read: runs no writes; safe to call speculatively from cart preview,
 *   checkout validation, or admin "price inspection" tooling.
 *
 * • Per-unit semantics: the resolver never multiplies by quantity. Callers
 *   compute `resolved.priceCents * quantity` themselves.
 *
 * • Base price source:
 *     - variant: `effectivePrice(product.price, variant.price)` — same rule
 *       the D2C storefront uses today.
 *
 * • Algorithm (order matters, per FAS 3 spec):
 *     STEP 1  Fetch base. If no companyLocationId → short-circuit to BASE.
 *     STEP 2  Fetch ACTIVE catalogs assigned to the location.
 *     STEP 3  For each catalog that covers this variant, compute a candidate
 *             price: VOLUME → FIXED → ADJUSTMENT.
 *     STEP 4  Pick the LOWEST candidate. Tie-break by earliest createdAt.
 *     STEP 5  No covering catalog → BASE.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CACHE WARNING
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Results are a function of (tenantId, companyLocationId, productRef,
 * quantity). DO NOT cache by productRef alone — that would leak another
 * company's negotiated prices. Any future cache layer MUST include
 * companyLocationId in the cache key and invalidate on catalog / assignment
 * mutations.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { effectivePrice } from "../products/pricing";
import { NotFoundError } from "../errors/service-errors";
import type { ProductRef, VolumePricingTier } from "../companies/types";

// ── Public types ────────────────────────────────────────────────

export type AppliedRule = "BASE" | "FIXED" | "VOLUME" | "ADJUSTMENT";

export interface ResolvedPrice {
  priceCents: bigint;
  basePriceCents: bigint;
  appliedCatalogId: string | null;
  appliedRule: AppliedRule;
  appliedTierMinQty: number | null;
  resolvedAt: Date;
}

export interface ResolveItem {
  productRef: ProductRef;
  quantity: number;
}

// ── Internal loaded shapes ─────────────────────────────────────

type LoadedCatalog = {
  id: string;
  createdAt: Date;
  includeAllProducts: boolean;
  overallAdjustmentPercent: Prisma.Decimal | null;
  fixedPrices: Array<{
    id: string;
    productVariantId: string | null;
    fixedPriceCents: bigint;
  }>;
  quantityRules: Array<{
    id: string;
    productVariantId: string | null;
    volumePricing: unknown;
  }>;
  inclusions: Array<{
    id: string;
    productVariantId: string | null;
    collectionId: string | null;
  }>;
};

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Decimal → integer representing `adjustment × 100` (two decimal places of
 * precision preserved). Example: 15.25 → BigInt(1525); -20 → BigInt(-2000).
 * Null adjustment → null (caller treats as "no adjustment").
 */
function adjustmentToBasisPoints(
  d: Prisma.Decimal | null | undefined,
): bigint | null {
  if (d == null) return null;
  // Prisma.Decimal has .mul() and .toFixed(); toFixed(0) after ×100 gives an
  // integer string we can pass directly to BigInt.
  return BigInt(d.mul(100).toFixed(0));
}

/**
 * Apply `adj` (stored as basis-points-like integer, i.e. percent × 100) to
 * `base` using banker's rounding. Banker's rounding breaks ties at exactly
 * .5 toward the even integer, avoiding the statistical bias of always-up
 * rounding across large order volumes.
 *
 * All arithmetic is BigInt; no intermediate floats. We scale by 10_000 so
 * that a single final divide carries the adjustment's two decimal digits.
 */
function applyAdjustment(base: bigint, adjBps: bigint): bigint {
  const numerator = base * (BigInt(10000) + adjBps);
  const denom = BigInt(10000);
  return bankerDivide(numerator, denom);
}

function bankerDivide(num: bigint, denom: bigint): bigint {
  const negative = num < BigInt(0) !== denom < BigInt(0);
  const absNum = num < BigInt(0) ? -num : num;
  const absDenom = denom < BigInt(0) ? -denom : denom;
  const q = absNum / absDenom;
  const r = absNum % absDenom;
  const twiceR = r * BigInt(2);
  let rounded: bigint;
  if (twiceR < absDenom) rounded = q;
  else if (twiceR > absDenom) rounded = q + BigInt(1);
  else rounded = q % BigInt(2) === BigInt(0) ? q : q + BigInt(1);
  return negative ? -rounded : rounded;
}

/**
 * Parse the volumePricing JSON blob to typed tiers with BigInt priceCents.
 * Returns [] for null/invalid shape — the catalog still "covers" the product
 * by virtue of the rule row existing, but the VOLUME branch won't match.
 */
function parseVolumePricing(
  raw: unknown,
): Array<{ minQty: number; priceCents: bigint }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ minQty: number; priceCents: bigint }> = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { minQty?: unknown }).minQty === "number" &&
      typeof (entry as { priceCents?: unknown }).priceCents === "string"
    ) {
      const minQty = (entry as { minQty: number }).minQty;
      const priceStr = (entry as { priceCents: string }).priceCents;
      if (Number.isInteger(minQty) && /^-?\d+$/.test(priceStr)) {
        out.push({ minQty, priceCents: BigInt(priceStr) });
      }
    }
  }
  return out;
}

function refMatches(
  row: { productVariantId: string | null },
  ref: ProductRef,
): boolean {
  return row.productVariantId === ref.id;
}

// ── Base price loaders ─────────────────────────────────────────

async function loadBasePrices(
  tenantId: string,
  refs: ProductRef[],
): Promise<{
  basePrices: Map<string, bigint>;
  variantToProduct: Map<string, string>;
}> {
  const variantIds = refs.map((r) => r.id);

  const variants =
    variantIds.length > 0
      ? await prisma.productVariant.findMany({
          where: {
            id: { in: variantIds },
            product: { tenantId },
          },
          select: {
            id: true,
            price: true,
            productId: true,
            product: { select: { price: true } },
          },
        })
      : [];

  const basePrices = new Map<string, bigint>();
  const variantToProduct = new Map<string, string>();

  for (const v of variants) {
    const unitInt = effectivePrice(v.product.price, v.price);
    basePrices.set(refKey({ type: "variant", id: v.id }), BigInt(unitInt));
    variantToProduct.set(v.id, v.productId);
  }

  return { basePrices, variantToProduct };
}

function refKey(ref: ProductRef): string {
  return `${ref.type}:${ref.id}`;
}

// ── Collection membership lookup (batched) ─────────────────────

async function loadCollectionMemberships(
  catalogs: LoadedCatalog[],
  variantToProduct: Map<string, string>,
): Promise<Set<string>> {
  const collectionIds = new Set<string>();
  for (const c of catalogs) {
    for (const inc of c.inclusions) {
      if (inc.collectionId) collectionIds.add(inc.collectionId);
    }
  }
  const productIds = Array.from(new Set(variantToProduct.values()));
  if (collectionIds.size === 0 || productIds.length === 0) {
    return new Set();
  }
  const rows = await prisma.productCollectionItem.findMany({
    where: {
      productId: { in: productIds },
      collectionId: { in: Array.from(collectionIds) },
    },
    select: { productId: true, collectionId: true },
  });
  const out = new Set<string>();
  for (const r of rows) out.add(`${r.productId}:${r.collectionId}`);
  return out;
}

// ── Coverage + candidate computation ───────────────────────────

function catalogCovers(
  catalog: LoadedCatalog,
  ref: ProductRef,
  variantToProduct: Map<string, string>,
  memberships: Set<string>,
): boolean {
  if (catalog.includeAllProducts) return true;

  for (const fp of catalog.fixedPrices) if (refMatches(fp, ref)) return true;
  for (const qr of catalog.quantityRules) if (refMatches(qr, ref)) return true;
  for (const inc of catalog.inclusions) if (refMatches(inc, ref)) return true;

  if (ref.type === "variant") {
    const productId = variantToProduct.get(ref.id);
    if (productId) {
      for (const inc of catalog.inclusions) {
        if (
          inc.collectionId &&
          memberships.has(`${productId}:${inc.collectionId}`)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

interface Candidate {
  priceCents: bigint;
  rule: Exclude<AppliedRule, "BASE">;
  tierMinQty: number | null;
}

function candidateFor(
  catalog: LoadedCatalog,
  ref: ProductRef,
  quantity: number,
  base: bigint,
): Candidate {
  // (a) VOLUME tier
  const qr = catalog.quantityRules.find((r) => refMatches(r, ref));
  if (qr) {
    const tiers = parseVolumePricing(qr.volumePricing);
    // Find the LARGEST tier whose minQty <= quantity.
    let best: { minQty: number; priceCents: bigint } | null = null;
    for (const t of tiers) {
      if (t.minQty <= quantity && (!best || t.minQty > best.minQty)) best = t;
    }
    if (best) {
      return {
        priceCents: best.priceCents,
        rule: "VOLUME",
        tierMinQty: best.minQty,
      };
    }
  }

  // (b) FIXED price
  const fp = catalog.fixedPrices.find((f) => refMatches(f, ref));
  if (fp) {
    return {
      priceCents: fp.fixedPriceCents,
      rule: "FIXED",
      tierMinQty: null,
    };
  }

  // (c) ADJUSTMENT
  const adjBps = adjustmentToBasisPoints(catalog.overallAdjustmentPercent);
  if (adjBps !== null) {
    return {
      priceCents: applyAdjustment(base, adjBps),
      rule: "ADJUSTMENT",
      tierMinQty: null,
    };
  }

  // Catalog covers but has no mechanism — returns base as a degenerate
  // candidate. Rule is tagged ADJUSTMENT since "no rule change" is
  // semantically a zero-adjustment.
  return { priceCents: base, rule: "ADJUSTMENT", tierMinQty: null };
}

// ── Catalog loader ─────────────────────────────────────────────

async function loadAssignedActiveCatalogs(
  tenantId: string,
  companyLocationId: string,
): Promise<LoadedCatalog[]> {
  const rows = await prisma.catalog.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      assignments: { some: { companyLocationId } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      fixedPrices: true,
      quantityRules: true,
      inclusions: true,
    },
  });
  return rows.map(
    (r) =>
      ({
        id: r.id,
        createdAt: r.createdAt,
        includeAllProducts: r.includeAllProducts,
        overallAdjustmentPercent: r.overallAdjustmentPercent,
        fixedPrices: r.fixedPrices.map((fp) => ({
          id: fp.id,
          productVariantId: fp.productVariantId,
          fixedPriceCents: fp.fixedPriceCents,
        })),
        quantityRules: r.quantityRules.map((qr) => ({
          id: qr.id,
          productVariantId: qr.productVariantId,
          volumePricing: qr.volumePricing,
        })),
        inclusions: r.inclusions.map((inc) => ({
          id: inc.id,
          productVariantId: inc.productVariantId,
          collectionId: inc.collectionId,
        })),
      }) satisfies LoadedCatalog,
  );
}

// ── Public API ──────────────────────────────────────────────────

export async function resolvePriceForLocation(params: {
  tenantId: string;
  companyLocationId: string | null;
  productRef: ProductRef;
  quantity: number;
}): Promise<ResolvedPrice> {
  const [resolved] = await batchResolvePricesForLocation({
    tenantId: params.tenantId,
    companyLocationId: params.companyLocationId,
    items: [{ productRef: params.productRef, quantity: params.quantity }],
  });
  return resolved;
}

export async function batchResolvePricesForLocation(params: {
  tenantId: string;
  companyLocationId: string | null;
  items: ResolveItem[];
}): Promise<ResolvedPrice[]> {
  const resolvedAt = new Date();
  if (params.items.length === 0) return [];

  // STEP 1 — bases.
  const refs = params.items.map((i) => i.productRef);
  const { basePrices, variantToProduct } = await loadBasePrices(
    params.tenantId,
    refs,
  );

  // Missing bases surface as NotFound — callers hitting this mid-cart know
  // the product was removed / archived / tenant-foreign.
  for (const ref of refs) {
    if (!basePrices.has(refKey(ref))) {
      throw new NotFoundError("Product not found in tenant", {
        type: ref.type,
        id: ref.id,
        tenantId: params.tenantId,
      });
    }
  }

  if (params.companyLocationId === null) {
    return params.items.map((i) => {
      const base = basePrices.get(refKey(i.productRef)) as bigint;
      return {
        priceCents: base,
        basePriceCents: base,
        appliedCatalogId: null,
        appliedRule: "BASE",
        appliedTierMinQty: null,
        resolvedAt,
      };
    });
  }

  // STEPS 2 & 3 setup — single fetch of catalogs + batched membership load.
  const catalogs = await loadAssignedActiveCatalogs(
    params.tenantId,
    params.companyLocationId,
  );
  const memberships = await loadCollectionMemberships(
    catalogs,
    variantToProduct,
  );

  return params.items.map((item) => {
    const base = basePrices.get(refKey(item.productRef)) as bigint;

    if (catalogs.length === 0) {
      return {
        priceCents: base,
        basePriceCents: base,
        appliedCatalogId: null,
        appliedRule: "BASE",
        appliedTierMinQty: null,
        resolvedAt,
      };
    }

    // STEPS 3 & 4 — candidates + lowest-with-earliest-tiebreak.
    let winner: {
      catalogId: string;
      createdAt: Date;
      candidate: Candidate;
    } | null = null;

    for (const c of catalogs) {
      if (!catalogCovers(c, item.productRef, variantToProduct, memberships)) {
        continue;
      }
      const cand = candidateFor(c, item.productRef, item.quantity, base);
      if (!winner) {
        winner = { catalogId: c.id, createdAt: c.createdAt, candidate: cand };
        continue;
      }
      // Lowest price wins; on tie, earliest-created wins.
      if (cand.priceCents < winner.candidate.priceCents) {
        winner = { catalogId: c.id, createdAt: c.createdAt, candidate: cand };
      } else if (
        cand.priceCents === winner.candidate.priceCents &&
        c.createdAt < winner.createdAt
      ) {
        winner = { catalogId: c.id, createdAt: c.createdAt, candidate: cand };
      }
    }

    if (!winner) {
      return {
        priceCents: base,
        basePriceCents: base,
        appliedCatalogId: null,
        appliedRule: "BASE",
        appliedTierMinQty: null,
        resolvedAt,
      };
    }

    return {
      priceCents: winner.candidate.priceCents,
      basePriceCents: base,
      appliedCatalogId: winner.catalogId,
      appliedRule: winner.candidate.rule,
      appliedTierMinQty: winner.candidate.tierMinQty,
      resolvedAt,
    };
  });
}

// ── Internal test surface ──────────────────────────────────────
// Exposed only for targeted rounding tests; not part of the public API.
export const __internal = {
  applyAdjustment,
  bankerDivide,
  adjustmentToBasisPoints,
  parseVolumePricing,
};
export type { VolumePricingTier };
