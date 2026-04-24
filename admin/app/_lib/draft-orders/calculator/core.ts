/**
 * DraftCalculator — Pure Core
 * ════════════════════════════
 *
 * Synchronous, side-effect-free computation of a DraftOrder's totals.
 *
 * Safe to call thousands of times during a draft's edit lifetime —
 * no DB access, no PMS calls, no network. The orchestrator
 * (`./orchestrator.ts`) feeds this core a complete `DraftTotalsInput`
 * assembled from the DraftOrder/DraftLineItem snapshot rows + an
 * optional `CalculatedDiscountImpact`.
 *
 * See FAS 6.4 Sub-step A audit for the full 8-step spec and rounding
 * rules. Key conventions applied throughout:
 *   - Money in BigInt ören.
 *   - Math.floor for discounts (discount never inflates).
 *   - Math.round for tax (Swedish VAT convention, matches
 *     checkout/engine.ts L122).
 *   - `taxesIncluded=true`: tax is extracted from gross
 *     (`tax = round(gross × rate / (10000 + rate))`); `totalCents`
 *     does NOT re-add tax.
 *   - `taxesIncluded=false`: tax is added on top of net
 *     (`tax = round(net × rate / 10000)`); `totalCents` includes tax.
 */

import type {
  DraftTotals,
  DraftTotalsInput,
  DraftTotalsLineBreakdown,
  DraftTotalsLineInput,
} from "./types";
import type { CalculatedDiscountImpact } from "@/app/_lib/discounts/apply";

// ── Helpers ────────────────────────────────────────────────────

function clampNonNeg(v: bigint): bigint {
  return v < BigInt(0) ? BigInt(0) : v;
}

function cap(value: bigint, max: bigint): bigint {
  return value > max ? max : value;
}

function parseDecimalPercent(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Step 2: Manual line discount ───────────────────────────────
//
// TODO(FAS 6.5 service): staff-UI must enforce XOR between fixed-amount
// and percentage per line. Core is defensive here but the invariant should
// be prevented upstream before this code path is hit.

function computeManualLineDiscount(
  line: DraftTotalsLineInput,
  warnings: Set<string>,
): bigint {
  const hasFixed = line.lineDiscountCents > BigInt(0);
  const pct = parseDecimalPercent(line.lineDiscountValue);
  const hasPercentage = line.lineDiscountType === "PERCENTAGE" && pct !== null;

  if (hasFixed && hasPercentage) {
    warnings.add("LINE_DISCOUNT_DOUBLE_SET");
  }

  if (hasFixed) {
    return cap(line.lineDiscountCents, line.subtotalCents);
  }
  if (hasPercentage) {
    const floored = BigInt(
      Math.floor((Number(line.subtotalCents) * (pct as number)) / 100),
    );
    return cap(floored, line.subtotalCents);
  }
  return BigInt(0);
}

// ── Step 4: Allocate order-level discount across lines ─────────
//
// scope=LINE: use perLine directly, cap each at the line's post-
//             manual-discount net. Unknown IDs contribute nothing
//             (silently dropped — defensive; orchestrator supplies
//             DraftLineItem.id which is stable).
// scope=ORDER: floor pro-rata by post-manual-discount line net +
//              remainder-to-last-line. Matches apply.ts:105 algorithm.

function allocateOrderDiscount(
  impact: Extract<CalculatedDiscountImpact, { valid: true }>,
  lineNetsById: Map<string, bigint>,
  lineOrder: readonly string[],
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const id of lineOrder) out.set(id, BigInt(0));

  if (impact.allocations.scope === "LINE") {
    for (const pl of impact.allocations.perLine) {
      const net = lineNetsById.get(pl.lineItemId);
      if (net === undefined) continue; // Unknown line — drop
      const existing = out.get(pl.lineItemId) ?? BigInt(0);
      const additional = cap(BigInt(pl.amount), net - existing);
      out.set(pl.lineItemId, existing + clampNonNeg(additional));
    }
    return out;
  }

  // scope === "ORDER" — pro-rata distribution
  const total = BigInt(impact.allocations.amount);
  if (total <= BigInt(0)) return out;

  const totalNet = [...lineNetsById.values()].reduce((a, v) => a + v, BigInt(0));
  if (totalNet <= BigInt(0)) return out;

  let allocated = BigInt(0);
  const last = lineOrder.length - 1;
  for (let i = 0; i < lineOrder.length; i++) {
    const id = lineOrder[i];
    const net = lineNetsById.get(id) ?? BigInt(0);
    if (i === last) {
      // Last line gets the remainder (matches apply.ts convention)
      out.set(id, cap(clampNonNeg(total - allocated), net));
      break;
    }
    const share = BigInt(
      Math.floor((Number(total) * Number(net)) / Number(totalNet)),
    );
    const capped = cap(share, net);
    out.set(id, capped);
    allocated += capped;
  }

  return out;
}

// ── Step 6: Tax calculation ────────────────────────────────────

function computeLineTax(
  taxableBase: bigint,
  taxRateBp: number,
  taxesIncluded: boolean,
): bigint {
  if (taxableBase === BigInt(0) || taxRateBp === 0) return BigInt(0);
  const base = Number(taxableBase);
  if (taxesIncluded) {
    // Extract VAT from gross: tax = round(gross × rate / (10000 + rate))
    return BigInt(Math.round((base * taxRateBp) / (10000 + taxRateBp)));
  }
  // Add-on VAT: tax = round(net × rate / 10000)
  return BigInt(Math.round((base * taxRateBp) / 10000));
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Compute a DraftOrder's totals from a pre-assembled input.
 *
 * Pure. No DB, no network, no time dependency. Always returns
 * `source: "COMPUTED"` and `frozenAt: null`. The orchestrator
 * handles the frozen-snapshot path before ever calling this.
 */
export function computeDraftTotalsPure(
  input: DraftTotalsInput,
): DraftTotals {
  const warnings = new Set<string>();

  // ── Step 1 + pre-processing: validate snapshot, clamp quantity ──
  const lines = input.lines.map((line) => {
    let quantity = line.quantity;
    if (quantity < 0) {
      quantity = 0;
      warnings.add("INVALID_QUANTITY");
    }
    const expectedSubtotal = line.unitPriceCents * BigInt(quantity);
    if (line.subtotalCents !== expectedSubtotal) {
      warnings.add("SUBTOTAL_SNAPSHOT_MISMATCH");
    }
    return { ...line, quantity };
  });

  // ── Step 2 + 3: Manual line discounts, pre-order-discount nets ──
  const manualDiscounts = lines.map((line) =>
    computeManualLineDiscount(line, warnings),
  );
  const lineNets = lines.map((line, i) =>
    clampNonNeg(line.subtotalCents - manualDiscounts[i]),
  );

  const lineNetsById = new Map<string, bigint>();
  const lineOrder: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    lineNetsById.set(lines[i].id, lineNets[i]);
    lineOrder.push(lines[i].id);
  }

  // ── Step 4: Order-level allocation ──
  const orderAllocations = input.orderDiscountImpact
    ? allocateOrderDiscount(input.orderDiscountImpact, lineNetsById, lineOrder)
    : new Map<string, bigint>();

  // ── Steps 5-8 (per line) + sums ──
  const perLine: DraftTotalsLineBreakdown[] = [];
  let subtotalSum = BigInt(0);
  let manualSum = BigInt(0);
  let orderSum = BigInt(0);
  let taxSum = BigInt(0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const manual = manualDiscounts[i];
    const orderAlloc = orderAllocations.get(line.id) ?? BigInt(0);
    const totalLineDiscount = manual + orderAlloc;

    // Step 5: taxable base
    const baseAfterDiscount = clampNonNeg(line.subtotalCents - totalLineDiscount);
    const suppressed = !line.taxable || input.companyTaxExempt;
    const taxableBase = suppressed ? BigInt(0) : baseAfterDiscount;

    // Step 6: tax
    const taxCents = computeLineTax(
      taxableBase,
      line.taxRateBp,
      input.taxesIncluded,
    );

    // Step 8 per-line: line contribution to total
    const lineTotal = input.taxesIncluded
      ? baseAfterDiscount
      : baseAfterDiscount + taxCents;

    perLine.push({
      lineId: line.id,
      subtotalCents: line.subtotalCents,
      manualLineDiscountCents: manual,
      allocatedOrderDiscountCents: orderAlloc,
      totalLineDiscountCents: totalLineDiscount,
      taxableBaseCents: taxableBase,
      taxCents,
      totalCents: lineTotal,
    });

    subtotalSum += line.subtotalCents;
    manualSum += manual;
    orderSum += orderAlloc;
    taxSum += taxCents;
  }

  // ── Step 7 + 8: shipping pass-through + top-level total ──
  //
  // Shipping is NOT taxed in 6.4 — see audit §4 Step 7. Future
  // ShippingEngine phase will decide shipping-tax policy.
  const totalDiscount = manualSum + orderSum;
  const baseWithoutDiscount = subtotalSum - totalDiscount;
  const totalCents = input.taxesIncluded
    ? baseWithoutDiscount + input.shippingCents
    : baseWithoutDiscount + taxSum + input.shippingCents;

  return {
    source: "COMPUTED",
    frozenAt: null,
    currency: input.currency,
    subtotalCents: subtotalSum,
    totalLineDiscountCents: manualSum,
    orderDiscountCents: orderSum,
    totalDiscountCents: totalDiscount,
    taxCents: taxSum,
    shippingCents: input.shippingCents,
    totalCents,
    perLine,
    warnings: [...warnings],
  };
}
