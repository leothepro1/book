/**
 * Stripe Connect Account Verification (cached)
 * ═════════════════════════════════════════════
 *
 * Verifies that a connected Stripe account can accept charges.
 * Result cached in-memory for 60 seconds per account to avoid
 * hitting Stripe on every checkout request.
 */

import { getStripe } from "./client";

const cache = new Map<string, { chargesEnabled: boolean; ts: number }>();
const TTL = 60_000; // 60 seconds

export async function verifyChargesEnabled(stripeAccountId: string): Promise<boolean> {
  const cached = cache.get(stripeAccountId);
  if (cached && Date.now() - cached.ts < TTL) {
    return cached.chargesEnabled;
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const chargesEnabled = account.charges_enabled === true;

  cache.set(stripeAccountId, { chargesEnabled, ts: Date.now() });
  return chargesEnabled;
}
