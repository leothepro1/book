/**
 * Cart Client
 * ═══════════
 *
 * Browser-only cart state management using localStorage.
 * No server imports — this module is safe for client components.
 *
 * Key format: bf_cart_{tenantId}
 */

import type { Cart, CartItem } from "./types";

function storageKey(tenantId: string): string {
  return `bf_cart_${tenantId}`;
}

function emptyCart(tenantId: string): Cart {
  return {
    tenantId,
    items: [],
    currency: "SEK",
    updatedAt: new Date().toISOString(),
  };
}

function save(cart: Cart): Cart {
  cart.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(storageKey(cart.tenantId), JSON.stringify(cart));
  } catch {
    // localStorage full or unavailable — cart still works in memory
  }
  return cart;
}

/**
 * Load cart from localStorage. Returns empty cart if not found.
 */
export function getCart(tenantId: string): Cart {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return emptyCart(tenantId);
    const parsed = JSON.parse(raw) as Cart;
    // Validate shape
    if (!parsed.items || !Array.isArray(parsed.items)) return emptyCart(tenantId);
    return parsed;
  } catch {
    return emptyCart(tenantId);
  }
}

/**
 * Add an item to the cart. If the same product+variant already exists,
 * increments quantity instead of adding a duplicate.
 */
export function addItem(tenantId: string, item: CartItem): Cart {
  const cart = getCart(tenantId);

  const existing = cart.items.find(
    (i) => i.productId === item.productId && i.variantId === item.variantId,
  );

  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.items.push(item);
  }

  return save(cart);
}

/**
 * Remove an item from the cart by its client-generated ID.
 */
export function removeItem(tenantId: string, itemId: string): Cart {
  const cart = getCart(tenantId);
  cart.items = cart.items.filter((i) => i.id !== itemId);
  return save(cart);
}

/**
 * Update quantity for a cart item. Removes if quantity <= 0.
 */
export function updateQuantity(
  tenantId: string,
  itemId: string,
  quantity: number,
): Cart {
  const cart = getCart(tenantId);

  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => i.id !== itemId);
  } else {
    const item = cart.items.find((i) => i.id === itemId);
    if (item) item.quantity = quantity;
  }

  return save(cart);
}

/**
 * Clear all items from the cart.
 */
export function clearCart(tenantId: string): void {
  try {
    localStorage.removeItem(storageKey(tenantId));
  } catch {
    // Ignore
  }
}

/**
 * Total number of items (sum of quantities).
 */
export function getItemCount(tenantId: string): number {
  const cart = getCart(tenantId);
  return cart.items.reduce((sum, i) => sum + i.quantity, 0);
}

/**
 * Cart total in smallest currency unit (ören).
 */
export function getCartTotal(tenantId: string): number {
  const cart = getCart(tenantId);
  return cart.items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0);
}
