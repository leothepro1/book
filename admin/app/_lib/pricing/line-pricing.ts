/**
 * Line pricing helpers — the single entry point for computing line-item
 * prices across checkout, DraftCalculator (FAS 6.4), and any future cart
 * / quote engine.
 *
 * Design:
 *   - Thin wrappers around existing pricers (resolveAccommodationPrice,
 *     effectivePrice, resolvePriceForLocation). Zero new pricing logic.
 *     If you're tempted to compute a price in here, stop — extend the
 *     underlying pricer instead.
 *   - Errors propagate verbatim. Callers already know how to handle
 *     AccommodationPriceError / NotFoundError etc.
 *   - Money returned as BigInt ören. Input prices from the underlying
 *     pricers are `number`; we widen via `BigInt(n)`. Safe because
 *     ören values are always integers and never exceed Number.MAX_SAFE_INTEGER
 *     in practice (a single night > 90 billion SEK would be needed).
 *
 * Per Pass 3 Risk #8: accommodation pricing is always LIVE_PMS — B2B
 * catalogs never override accommodation prices. `computeAccommodationLinePrice`
 * therefore does NOT accept a buyerContext; the companion product helper does.
 */

import {
  resolveAccommodationPrice,
} from "../accommodations/pricing";
import { resolvePriceForLocation } from "./b2b-resolver";
import { prisma } from "@/app/_lib/db/prisma";
import { NotFoundError } from "../errors/service-errors";

// ── Shared types ──────────────────────────────────────────────

// TODO: consolidate with other call-sites that carry adults/children/infants
// (checkout, booking, search) when a canonical home exists in app/_lib.
export type GuestCounts = {
  adults: number;
  children: number;
  infants: number;
};

// TODO: narrow to the existing allowlist (SEK | EUR | NOK | DKK) once the
// enum is extracted from app/api/checkout/create/route.ts into a shared
// currency module. String alias matches the rest of the codebase today.
export type CurrencyCode = string;

export type LinePricingBuyerContext =
  | { kind: "guest"; guestAccountId?: string | null }
  | { kind: "company"; companyLocationId: string; companyContactId?: string }
  | { kind: "walk_in" };

// ── Accommodation line pricing ────────────────────────────────

export type AccommodationLinePriceInput = {
  tenantId: string;
  accommodationId: string;
  /** ISO YYYY-MM-DD. Parsed into local Date at call time. */
  checkInDate: string;
  /** ISO YYYY-MM-DD. Parsed into local Date at call time. */
  checkOutDate: string;
  /**
   * Split guest counts. Flattened to `adults + children` when calling the
   * underlying PMS pricer — infants don't count toward occupancy (industry
   * standard; matches FakeAdapter behaviour).
   */
  guestCounts: GuestCounts;
  /** Optional explicit rate-plan override. First available plan is used if omitted. */
  ratePlanId?: string;
  /**
   * Caller preference hint. Ignored if PMS returns a different currency
   * on the resolved rate plan (PMS is source of truth for currency).
   * Default: "SEK" (tenant standard).
   */
  currency?: CurrencyCode;
};

export type AccommodationLinePriceResult = {
  /** Per-night price in ören/cents. */
  unitPriceCents: bigint;
  nights: number;
  /** `unitPriceCents` × `nights`. Pre-computed so callers don't re-multiply. */
  subtotalCents: bigint;
  /** PMS-returned currency — always wins over the `input.currency` hint. */
  currency: CurrencyCode;
  ratePlan: {
    id: string;
    name: string;
    cancellationPolicy: string | null;
  };
  /**
   * The PMS-side Accommodation (room category) external ID. Needed by
   * downstream booking creation to populate Booking.unit. Sourced from
   * `Accommodation.externalId`, not from `ratePlan.externalId`.
   */
  accommodationExternalId: string;
  /**
   * Per Pass 3 Risk #8: accommodation pricing is always LIVE_PMS.
   * B2B catalogs never override accommodation prices.
   */
  sourceRule: "LIVE_PMS";
  /** Always null for accommodation lines. */
  appliedCatalogId: null;
};

/**
 * Compute the per-line price for an accommodation booking. Thin wrapper
 * around {@link resolveAccommodationPrice}; see design block at the top
 * of this module for the rationale.
 *
 * Errors (`AccommodationPriceError` with `code` in
 * ACCOMMODATION_NOT_FOUND | PMS_UNAVAILABLE | CATEGORY_NOT_AVAILABLE |
 * RATE_PLAN_NOT_FOUND | INVALID_DATES) propagate unwrapped — the route
 * already knows how to handle them.
 */
export async function computeAccommodationLinePrice(
  input: AccommodationLinePriceInput,
): Promise<AccommodationLinePriceResult> {
  const guests = input.guestCounts.adults + input.guestCounts.children;

  const priceResult = await resolveAccommodationPrice({
    tenantId: input.tenantId,
    accommodationId: input.accommodationId,
    ratePlanId: input.ratePlanId,
    checkIn: new Date(input.checkInDate),
    checkOut: new Date(input.checkOutDate),
    guests,
  });

  return {
    unitPriceCents: BigInt(priceResult.pricePerNight),
    nights: priceResult.nights,
    subtotalCents: BigInt(priceResult.totalPrice),
    currency: priceResult.currency,
    ratePlan: {
      id: priceResult.ratePlan.externalId,
      name: priceResult.ratePlan.name,
      cancellationPolicy: priceResult.ratePlan.cancellationPolicy,
    },
    accommodationExternalId: priceResult.externalId,
    sourceRule: "LIVE_PMS",
    appliedCatalogId: null,
  };
}

// ── Product-variant line pricing ──────────────────────────────

export type ProductLinePriceInput = {
  tenantId: string;
  productVariantId: string;
  quantity: number;
  buyerContext: LinePricingBuyerContext;
  /**
   * Caller preference hint. IGNORED — Product.currency is the source
   * of truth and is loaded from the DB. Accepted for API symmetry
   * with AccommodationLinePriceInput.
   */
  currency?: CurrencyCode;
};

export type ProductLinePriceResult = {
  /** Per-unit resolved price in ören/cents, after any B2B catalog rules. */
  unitPriceCents: bigint;
  quantity: number;
  /** `unitPriceCents × quantity`, pre-computed for callers. */
  subtotalCents: bigint;
  /** Authoritative currency from Product.currency (NOT input.currency). */
  currency: CurrencyCode;
  /** Which rule the B2B resolver applied. `BASE` when no catalog won. */
  sourceRule: "BASE" | "FIXED" | "VOLUME" | "ADJUSTMENT";
  /** Winning catalog's id when a B2B rule applied; null for BASE. */
  appliedCatalogId: string | null;
};

/**
 * Compute the per-line price for a product-variant line.
 *
 * Routing:
 *   - `buyerContext.kind === "company"` → pass the companyLocationId to
 *     the B2B resolver so assigned-catalog rules apply.
 *   - `buyerContext.kind === "guest" | "walk_in"` → pass null so the
 *     resolver short-circuits to BASE without loading any catalogs
 *     (same code path as D2C storefront today).
 *
 * Currency is loaded from `Product.currency` via a separate findFirst.
 * The resolver does its own variant lookup internally but doesn't
 * return currency — extending its shape would be a wider refactor.
 * The extra query is a pragmatic cost for the admin/DraftCalculator flow.
 *
 * Errors (`NotFoundError` from either the resolver or our own variant
 * lookup) propagate unwrapped.
 */
export async function computeProductLinePrice(
  input: ProductLinePriceInput,
): Promise<ProductLinePriceResult> {
  const companyLocationId =
    input.buyerContext.kind === "company"
      ? input.buyerContext.companyLocationId
      : null;

  const resolved = await resolvePriceForLocation({
    tenantId: input.tenantId,
    companyLocationId,
    productRef: { type: "variant", id: input.productVariantId },
    quantity: input.quantity,
  });

  // Authoritative currency — Product owns it, not the caller. Separate
  // query because ResolvedPrice doesn't carry currency today (and adding
  // it would widen the resolver's contract).
  const variant = await prisma.productVariant.findFirst({
    where: { id: input.productVariantId, product: { tenantId: input.tenantId } },
    select: { product: { select: { currency: true } } },
  });
  if (!variant) {
    throw new NotFoundError("ProductVariant not found in tenant", {
      productVariantId: input.productVariantId,
      tenantId: input.tenantId,
    });
  }

  const subtotalCents = resolved.priceCents * BigInt(input.quantity);

  return {
    unitPriceCents: resolved.priceCents,
    quantity: input.quantity,
    subtotalCents,
    currency: variant.product.currency,
    sourceRule: resolved.appliedRule,
    appliedCatalogId: resolved.appliedCatalogId,
  };
}
