/**
 * DraftCalculator — Public Types
 * ═══════════════════════════════
 *
 * Input/output shapes for the pure core (`computeDraftTotalsPure`)
 * and the async orchestrator (`computeDraftTotals`).
 *
 * Money convention: BigInt ören throughout. Interoperability with
 * `calculateDiscountImpact` (which uses `number`) is bridged inside
 * the orchestrator via `Number(bigint)` / `BigInt(number)` — safe
 * because ören values fit well within `Number.MAX_SAFE_INTEGER`
 * (a 100 MSEK invoice = 10^10 ören; 2^53 ≈ 9×10^15).
 *
 * See FAS 6.4 Sub-step A audit for the full design rationale.
 */

import type { CalculatedDiscountImpact } from "@/app/_lib/discounts/apply";

// ── Line-level input ───────────────────────────────────────────

/**
 * A single draft line as input to the pure calculator core.
 *
 * All pricing inputs are BigInt ören. The orchestrator converts from
 * the DraftLineItem row; the calculator trusts the `subtotalCents`
 * snapshot and does not re-derive from `unitPriceCents × quantity`
 * except as an invariant check (see `warnings` on DraftTotals).
 *
 * `taxRateBp` is resolved by the orchestrator per the audit §2 chain
 * (Accommodation path → Product path → CUSTOM fallback).
 */
export type DraftTotalsLineInput = {
  /** DraftLineItem.id — stable across runs; used to key allocations. */
  id: string;
  /** DraftLineItem.lineType. Kept for diagnostics + future per-type logic. */
  lineType: "ACCOMMODATION" | "PRODUCT" | "CUSTOM";
  /** Per-unit price in ören. Pre-resolved by line-pricing helpers at add-time. */
  unitPriceCents: bigint;
  /** Line quantity. Clamped to 0 if negative (defensive). */
  quantity: number;
  /**
   * Snapshot of `unitPriceCents × quantity`. Core validates against the
   * multiplication and emits a warning if they disagree (does not throw).
   */
  subtotalCents: bigint;
  /** DraftLineItem.taxable. When false, tax is always 0 for this line. */
  taxable: boolean;
  /**
   * Resolved tax rate in basis points (1200 = 12%). Orchestrator's job
   * to resolve per the audit §2 chain. Core never does DB lookups.
   */
  taxRateBp: number;
  /**
   * Staff-manual fixed discount in ören. Takes precedence when > 0n.
   * Set by admin UI via numeric input.
   */
  lineDiscountCents: bigint;
  /**
   * Staff-manual discount type. Used only when `lineDiscountCents === 0n`
   * and `lineDiscountValue` is non-null.
   */
  lineDiscountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  /**
   * Staff-manual discount value as a Decimal(10,4) raw string
   * (e.g. "15.0000" = 15%). Matches the DraftLineItem.lineDiscountValue
   * column shape verbatim.
   */
  lineDiscountValue: string | null;
};

// ── Core input ─────────────────────────────────────────────────

/**
 * Input to `computeDraftTotalsPure` — the synchronous calculator core.
 *
 * No DB client, no async dependencies. The orchestrator assembles this
 * from the DraftOrder + DraftLineItem rows + an optional
 * `CalculatedDiscountImpact`.
 */
export type DraftTotalsInput = {
  currency: string;
  buyerKind: "GUEST" | "COMPANY";
  /**
   * DraftOrder.taxesIncluded. When true, line `unitPriceCents` are gross
   * (VAT already baked in); tax is extracted. When false, line prices
   * are net; tax is added on top. See audit §4 Step 6 for the math.
   */
  taxesIncluded: boolean;
  /**
   * True iff `buyerKind === "COMPANY"` AND the resolved
   * `CompanyLocation.taxSetting === "EXEMPT"`. Honoured in 6.4.
   * `COLLECT_UNLESS_EXEMPT` is deferred to a future tax-engine phase.
   */
  companyTaxExempt: boolean;
  /** DraftOrder.shippingCents — pass-through, not computed. */
  shippingCents: bigint;
  /** Lines in presentation order. */
  lines: DraftTotalsLineInput[];
  /**
   * Result of `calculateDiscountImpact()` when an order-level discount
   * code is applied. `null` for drafts without a code. Only `valid=true`
   * variants are passed through; invalid discounts surface as
   * DraftTotals warnings instead (orchestrator strips them).
   */
  orderDiscountImpact:
    | Extract<CalculatedDiscountImpact, { valid: true }>
    | null;
};

// ── Line-level output ──────────────────────────────────────────

/**
 * Per-line output from the calculator. Exposes staff-manual vs
 * engine-allocated discounts separately (audit §7 duality model).
 */
export type DraftTotalsLineBreakdown = {
  lineId: string;
  subtotalCents: bigint;
  /** Staff-manual discount applied in Step 2. */
  manualLineDiscountCents: bigint;
  /** Share of order-level discount allocated to this line (Step 4). */
  allocatedOrderDiscountCents: bigint;
  /** `manualLineDiscount + allocatedOrderDiscount` — convenience sum. */
  totalLineDiscountCents: bigint;
  /**
   * `subtotal − totalLineDiscount`, clamped to ≥ 0n. Feeds tax when
   * taxable and not company-exempt.
   */
  taxableBaseCents: bigint;
  /** Computed per Step 6; 0n when `!taxable` or `companyTaxExempt`. */
  taxCents: bigint;
  /**
   * Line contribution to the draft total. Semantics depend on
   * `taxesIncluded`:
   *   - `true`  → `subtotal − totalLineDiscount` (tax baked into subtotal)
   *   - `false` → `subtotal − totalLineDiscount + taxCents`
   */
  totalCents: bigint;
};

// ── Top-level output ───────────────────────────────────────────

/**
 * Output of `computeDraftTotalsPure` AND the orchestrator.
 *
 * `source` distinguishes freshly-computed values from frozen snapshots
 * (audit §6). The UI can render a "frozen" badge off this field.
 */
export type DraftTotals = {
  source: "COMPUTED" | "FROZEN_SNAPSHOT";
  /**
   * Set when `source === "FROZEN_SNAPSHOT"` — the DraftOrder.pricesFrozenAt
   * timestamp, so the UI can render "Frozen on ...". Null otherwise.
   */
  frozenAt: Date | null;
  currency: string;
  /** Sum of line subtotals (pre-any-discount, pre-tax). */
  subtotalCents: bigint;
  /** Sum of staff-manual line discounts across lines. */
  totalLineDiscountCents: bigint;
  /** Sum of engine-allocated order-level discount across lines. */
  orderDiscountCents: bigint;
  /** `totalLineDiscountCents + orderDiscountCents`. */
  totalDiscountCents: bigint;
  /** Sum of per-line `taxCents`. 0n today (tax stub returns 0). */
  taxCents: bigint;
  /** Pass-through from input. */
  shippingCents: bigint;
  /**
   * Final total. Formula per `taxesIncluded` branch:
   *   - `true`  → `subtotal − totalDiscount + shipping` (tax embedded in subtotal)
   *   - `false` → `subtotal − totalDiscount + tax + shipping`
   */
  totalCents: bigint;
  /** Per-line breakdowns in input order. */
  perLine: DraftTotalsLineBreakdown[];
  /**
   * Non-fatal advisories for the UI / logs. Codes include:
   *   - `"SUBTOTAL_SNAPSHOT_MISMATCH"` — line's subtotalCents disagrees
   *     with `unitPriceCents × quantity`. Core trusts the snapshot.
   *   - `"DISCOUNT_INVALID"` — applied code rejected at eval time
   *     (orchestrator-emitted).
   *   - `"MULTIPLE_CURRENCIES"` — defensive; upstream should reject.
   *   - `"INVALID_QUANTITY"` — line had negative quantity; clamped to 0.
   *   - `"LINE_DISCOUNT_DOUBLE_SET"` — both fixed and percentage set;
   *     fixed wins.
   * Empty in the happy path.
   */
  warnings: string[];
};

// ── Orchestrator options ───────────────────────────────────────

/**
 * Options for `computeDraftTotals` — the async orchestrator entry point.
 *
 * All fields optional with sensible defaults. Meant for test injection
 * and rare admin-UI-only flags.
 */
export type DraftCalculatorOptions = {
  /**
   * Inject a fixed `Date` for deterministic testing of
   * `calculateDiscountImpact`'s `now`-sensitive checks (DAYS_IN_ADVANCE,
   * ARRIVAL_WINDOW, startsAt/endsAt). Default: `new Date()` at call time.
   */
  now?: Date;
  /**
   * When true, skip the `pricesFrozenAt` short-circuit and force a
   * recompute. For admin "preview what totals would be if re-priced"
   * tooling only — never wire into the default admin UI path.
   * Default: `false`.
   */
  ignorePricesFrozenAt?: boolean;
  /**
   * When true, skip the subtotal-snapshot invariant check and trust
   * `DraftLineItem.subtotalCents` verbatim. Performance lever for
   * bulk re-computation jobs. Default: `false`.
   */
  skipSnapshotValidation?: boolean;
};
