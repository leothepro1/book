/**
 * Discount Codes
 * ══════════════
 *
 * Code normalization and lookup.
 * Codes are always stored and compared as uppercase trimmed strings.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { DiscountCode } from "@prisma/client";
import type { DiscountWithRelations } from "./types";

// ── Normalization ──────────────────────────────────────────────

/**
 * Normalize a discount code for storage and lookup.
 * Always: trim whitespace, uppercase.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// ── Lookup ─────────────────────────────────────────────────────

/**
 * Look up an active DiscountCode by normalized code string.
 * Returns null if not found, inactive, or belongs to a different tenant.
 * Never throws — return null on any lookup failure.
 */
export async function findDiscountCode(
  tenantId: string,
  rawCode: string,
): Promise<(DiscountCode & { discount: DiscountWithRelations }) | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  try {
    const result = await prisma.discountCode.findUnique({
      where: {
        tenantId_code: { tenantId, code },
      },
      include: {
        discount: {
          include: {
            conditions: true,
            codes: true,
            targetedProducts: true,
            targetedCollections: true,
            targetedSegments: true,
            targetedCustomers: true,
          },
        },
      },
    });

    if (!result || !result.isActive) return null;

    return result;
  } catch (err) {
    log("error", "discount.code_lookup_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
