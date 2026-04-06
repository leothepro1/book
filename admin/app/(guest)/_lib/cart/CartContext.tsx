"use client";

/**
 * Cart Context
 * ════════════
 *
 * Client-side cart state for the booking engine.
 * Wraps localStorage-based cart with React state.
 * Hydrates from localStorage on mount to avoid SSR mismatch.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Cart, CartItem } from "@/app/_lib/cart/types";
import {
  getCart,
  addItem as addCartItem,
  removeItem as removeCartItem,
  updateQuantity as updateCartQty,
  clearCart as clearCartStorage,
} from "@/app/_lib/cart/client";

interface CartContextValue {
  cart: Cart;
  addToCart: (item: Omit<CartItem, "id" | "addedAt">) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  cartTotal: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function emptyCart(tenantId: string): Cart {
  return { tenantId, items: [], currency: "SEK", updatedAt: new Date().toISOString() };
}

export function CartProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: ReactNode;
}) {
  const [cart, setCart] = useState<Cart>(() => emptyCart(tenantId));
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    setCart(getCart(tenantId));
    setHydrated(true);
  }, [tenantId]);

  // Listen for cart:open events from outside the CartProvider tree (e.g. header)
  useEffect(() => {
    const handle = () => setIsOpen(true);
    window.addEventListener("cart:open", handle);
    return () => window.removeEventListener("cart:open", handle);
  }, []);

  const addToCart = useCallback(
    (item: Omit<CartItem, "id" | "addedAt">) => {
      const fullItem: CartItem = {
        ...item,
        id: crypto.randomUUID(),
        addedAt: new Date().toISOString(),
      };
      const updated = addCartItem(tenantId, fullItem);
      setCart(updated);
      setIsOpen(true);
      window.dispatchEvent(new Event("cart:updated"));
    },
    [tenantId],
  );

  const removeFromCart = useCallback(
    (itemId: string) => {
      const updated = removeCartItem(tenantId, itemId);
      setCart(updated);
      window.dispatchEvent(new Event("cart:updated"));
    },
    [tenantId],
  );

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) => {
      const updated = updateCartQty(tenantId, itemId, quantity);
      setCart(updated);
      window.dispatchEvent(new Event("cart:updated"));
    },
    [tenantId],
  );

  const clearCartFn = useCallback(() => {
    clearCartStorage(tenantId);
    setCart(emptyCart(tenantId));
    window.dispatchEvent(new Event("cart:updated"));
  }, [tenantId]);

  const itemCount = hydrated
    ? cart.items.reduce((sum, i) => sum + i.quantity, 0)
    : 0;

  const cartTotal = hydrated
    ? cart.items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0)
    : 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart: clearCartFn,
        itemCount,
        cartTotal,
        isOpen,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
