/**
 * QuantityRuleValidator — validates that a cart item respects the
 * minQuantity / maxQuantity / increment rules attached to the B2B catalog
 * that produced the winning price.
 *
 * Rule source (Shopify parity): when multiple assigned catalogs have rules
 * for the same product, the rule from the catalog with the LOWEST price
 * for (productRef, quantity) wins — rules always follow the catalog the
 * buyer is actually charged against.
 *
 * No rule on the winning catalog → null (no restriction).
 * No catalog covers the product at all → null (pure D2C price, no B2B rule).
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  batchResolvePricesForLocation,
  type ResolvedPrice,
} from "./b2b-resolver";
import type { ProductRef } from "../companies/types";

export type QuantityRuleViolation =
  | { code: "BELOW_MIN"; required: number; actual: number }
  | { code: "ABOVE_MAX"; required: number; actual: number }
  | { code: "INVALID_INCREMENT"; increment: number; actual: number };

interface RuleRow {
  catalogId: string;
  productVariantId: string | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  increment: number | null;
}

function matchesRef(row: RuleRow, ref: ProductRef): boolean {
  return row.productVariantId === ref.id;
}

function evaluate(
  rule: RuleRow,
  quantity: number,
): QuantityRuleViolation | null {
  if (rule.minQuantity != null && quantity < rule.minQuantity) {
    return {
      code: "BELOW_MIN",
      required: rule.minQuantity,
      actual: quantity,
    };
  }
  if (rule.maxQuantity != null && quantity > rule.maxQuantity) {
    return {
      code: "ABOVE_MAX",
      required: rule.maxQuantity,
      actual: quantity,
    };
  }
  if (
    rule.increment != null &&
    rule.increment >= 1 &&
    quantity % rule.increment !== 0
  ) {
    return {
      code: "INVALID_INCREMENT",
      increment: rule.increment,
      actual: quantity,
    };
  }
  return null;
}

/**
 * Single-item validation — a thin wrapper over batchValidate for convenience
 * at call sites that only need to check one line (e.g. an "add to cart"
 * action). Checkout callers should use batchValidate to avoid N+1 queries.
 */
export async function validateQuantityForLocation(params: {
  tenantId: string;
  companyLocationId: string;
  productRef: ProductRef;
  quantity: number;
}): Promise<QuantityRuleViolation | null> {
  const [result] = await batchValidate({
    tenantId: params.tenantId,
    companyLocationId: params.companyLocationId,
    items: [{ productRef: params.productRef, quantity: params.quantity }],
  });
  return result.violation;
}

export async function batchValidate(params: {
  tenantId: string;
  companyLocationId: string;
  items: Array<{ productRef: ProductRef; quantity: number }>;
}): Promise<
  Array<{ productRef: ProductRef; violation: QuantityRuleViolation | null }>
> {
  if (params.items.length === 0) return [];

  // Resolve prices first — this is the source of truth for which catalog's
  // rules apply to each item. Reuses the resolver's catalog + membership
  // fetches; violations are independent of base-price math.
  const resolutions = await batchResolvePricesForLocation({
    tenantId: params.tenantId,
    companyLocationId: params.companyLocationId,
    items: params.items,
  });

  // Collect winning catalog IDs and load only their quantity-rule rows.
  const winningCatalogIds = Array.from(
    new Set(
      resolutions
        .map((r) => r.appliedCatalogId)
        .filter((id): id is string => id !== null),
    ),
  );
  const rules: RuleRow[] = winningCatalogIds.length
    ? await prisma.catalogQuantityRule.findMany({
        where: { catalogId: { in: winningCatalogIds } },
        select: {
          catalogId: true,
          productVariantId: true,
          minQuantity: true,
          maxQuantity: true,
          increment: true,
        },
      })
    : [];

  return params.items.map((item, idx) =>
    assembleResult(item, resolutions[idx], rules),
  );
}

function assembleResult(
  item: { productRef: ProductRef; quantity: number },
  resolution: ResolvedPrice,
  rules: RuleRow[],
): { productRef: ProductRef; violation: QuantityRuleViolation | null } {
  if (!resolution.appliedCatalogId) {
    // Item did not match any catalog → no B2B rule applies.
    return { productRef: item.productRef, violation: null };
  }
  const winnerRule = rules.find(
    (r) =>
      r.catalogId === resolution.appliedCatalogId &&
      matchesRef(r, item.productRef),
  );
  if (!winnerRule) {
    return { productRef: item.productRef, violation: null };
  }
  return {
    productRef: item.productRef,
    violation: evaluate(winnerRule, item.quantity),
  };
}

// Exported for tests — not part of the public API.
export const __internal = { evaluate };
export type { Prisma };
