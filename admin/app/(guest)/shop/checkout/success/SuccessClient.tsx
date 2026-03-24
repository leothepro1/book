"use client";

import { useEffect } from "react";
import { clearCart } from "@/app/_lib/cart/client";

/**
 * Clears the cart from localStorage on successful checkout.
 * This is a client component because localStorage is browser-only.
 */
export function SuccessClient({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    clearCart(tenantId);
  }, [tenantId]);

  return null;
}
