/**
 * Stripe Singleton
 * ════════════════
 *
 * Single source of truth for the Stripe instance.
 * All Stripe API calls go through this module — never instantiate Stripe elsewhere.
 *
 * STRIPE_SECRET_KEY is server-only — never exposed via NEXT_PUBLIC_.
 */

import Stripe from "stripe";
import { env } from "@/app/_lib/env";

let _stripe: Stripe | null = null;

/**
 * Returns the shared Stripe instance. Lazily initialized on first call
 * so the dev server can start without STRIPE_SECRET_KEY set.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}
