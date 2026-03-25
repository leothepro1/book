export const dynamic = "force-dynamic";

/**
 * Unified Checkout Route
 * ══════════════════════
 *
 * Single dynamic route that dispatches to the checkout engine.
 * Each checkout type is registered here — adding a new type
 * requires one import + one registry entry.
 *
 * Static routes (payment-intent, purchase-intent, create) take
 * precedence in Next.js App Router, so this coexists safely
 * during migration. Once old routes are removed, [type] handles all.
 */

import { NextResponse } from "next/server";
import { processCheckout } from "@/app/_lib/checkout/engine";
import { accommodationCheckout } from "@/app/_lib/checkout/types/accommodation";
import { purchaseCheckout } from "@/app/_lib/checkout/types/purchase";
import { cartCheckout } from "@/app/_lib/checkout/types/cart";
import type { CheckoutType } from "@/app/_lib/checkout/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGISTRY: Record<string, CheckoutType<any>> = {
  "payment-intent": accommodationCheckout,
  "purchase-intent": purchaseCheckout,
  "create": cartCheckout,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function POST(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  const checkout = REGISTRY[type];

  if (!checkout) {
    return NextResponse.json(
      { error: "UNKNOWN_CHECKOUT_TYPE" },
      { status: 404 },
    );
  }

  return processCheckout(req, checkout);
}
