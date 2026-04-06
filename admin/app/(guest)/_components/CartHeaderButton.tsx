"use client";

/**
 * Cart icon button for the guest header.
 *
 * Reads item count directly from localStorage (no CartContext dependency)
 * so it works on ALL pages, not just /shop/* routes.
 * Dispatches "cart:open" custom event — CartProvider listens and opens the drawer.
 * Re-syncs on storage events and after addToCart (via "cart:updated" custom event).
 */

import { useState, useEffect, useCallback } from "react";
import { getItemCount } from "@/app/_lib/cart/client";

export function CartHeaderButton({ tenantId }: { tenantId: string }) {
  const [count, setCount] = useState(0);

  const sync = useCallback(() => {
    setCount(getItemCount(tenantId));
  }, [tenantId]);

  useEffect(() => {
    sync(); // hydrate on mount

    // Re-sync when cart changes (from CartContext or other tabs)
    window.addEventListener("storage", sync);
    window.addEventListener("cart:updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("cart:updated", sync);
    };
  }, [sync]);

  if (count === 0) return null;

  return (
    <button
      type="button"
      className="cart-header-btn"
      onClick={() => window.dispatchEvent(new Event("cart:open"))}
      aria-label={`Varukorg (${count})`}
    >
      <span
        className="material-symbols-rounded"
        style={{ fontSize: 24, fontVariationSettings: "'FILL' 0, 'wght' 400" }}
      >
        shopping_bag
      </span>
      <span className="cart-header-btn__badge">{count}</span>
    </button>
  );
}
