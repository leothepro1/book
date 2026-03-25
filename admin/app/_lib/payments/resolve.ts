/**
 * Payment Method Resolver
 * ═══════════════════════
 *
 * resolvePaymentMethods() is the ONLY function checkout routes call
 * to determine what payment methods to pass to Stripe.
 *
 * Rules:
 * 1. alwaysOn methods are always included
 * 2. Missing methods in config use defaultEnabled from registry
 * 3. clientDetected methods (wallets) go in availableMethods but NOT
 *    in stripeTypes — they use "card" via Payment Request API
 * 4. Deduplicates stripeTypes
 */

import type { PaymentMethodConfig, PaymentMethodId, ResolvedPaymentMethods } from "./types";
import { PAYMENT_METHOD_REGISTRY } from "./registry";
import { DEFAULT_PAYMENT_METHOD_CONFIG } from "./defaults";

export function resolvePaymentMethods(
  config: PaymentMethodConfig | null,
): ResolvedPaymentMethods {
  const effective = config ?? DEFAULT_PAYMENT_METHOD_CONFIG;
  const enabledMethods: PaymentMethodId[] = [];
  const stripeTypesSet = new Set<string>();
  let walletsEnabled = false;
  let klarnaEnabled = false;

  for (const def of PAYMENT_METHOD_REGISTRY) {
    const isEnabled =
      def.alwaysOn || (effective.methods[def.id] ?? def.defaultEnabled);

    if (!isEnabled) continue;

    enabledMethods.push(def.id);

    if (def.id === "klarna") {
      klarnaEnabled = true;
    }

    if (def.clientDetected) {
      // Wallets don't add separate stripe types — they use "card" via Payment Request API
      walletsEnabled = true;
    } else {
      for (const st of def.stripeTypes) {
        stripeTypesSet.add(st);
      }
    }
  }

  return {
    stripeTypes: Array.from(stripeTypesSet),
    availableMethods: enabledMethods,
    walletsEnabled,
    klarnaEnabled,
  };
}
