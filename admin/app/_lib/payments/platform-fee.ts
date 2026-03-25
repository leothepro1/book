/**
 * Platform Fee Calculation
 * ════════════════════════
 *
 * Bedfront takes an application fee on every transaction.
 * Fee varies by tenant subscription plan, with per-tenant override.
 *
 * All fees in basis points (100 bps = 1%).
 * All amounts in smallest currency unit (ören/cents).
 */

import type { SubscriptionPlan } from "@prisma/client";

// ── Default fees per plan ───────────────────────────────────────

const PLAN_FEE_BPS: Record<SubscriptionPlan, number> = {
  BASIC: 500, // 5.0%
  GROW: 400,  // 4.0%
  PRO: 350,   // 3.5%
};

/**
 * Resolve effective fee in basis points.
 * Per-tenant override takes precedence over plan default.
 */
export function getPlatformFeeBps(
  plan: SubscriptionPlan,
  overrideBps?: number | null,
): number {
  return overrideBps ?? PLAN_FEE_BPS[plan];
}

/**
 * Calculate application fee amount in smallest currency unit.
 * Rounds DOWN — never charge more than intended.
 */
export function calculateApplicationFee(
  amountInSmallestUnit: number,
  feeBps: number,
): number {
  return Math.floor((amountInSmallestUnit * feeBps) / 10_000);
}

/**
 * Format fee for display. E.g. 500 → "5.0%", 350 → "3.5%"
 */
export function formatFeeBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}
