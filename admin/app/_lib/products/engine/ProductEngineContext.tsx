"use client";

/**
 * Product Engine Context
 * ══════════════════════
 *
 * Provides a single ProductEngine instance to all descendants.
 * Same pattern as CommerceEngineProvider — context + provider + hook.
 *
 * Without this, every component calling useProductEngine() gets an
 * isolated instance with independent state. The provider ensures
 * one shared engine per product page.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useProductEngine } from "./useProductEngine";
import type { StandardProductContext } from "@/app/(guest)/_lib/product-context/ProductContext";
import type { ProductEngine } from "./types";

const ProductEngineCtx = createContext<ProductEngine | null>(null);

export function ProductEngineProvider({
  product,
  children,
}: {
  product: StandardProductContext;
  children: ReactNode;
}) {
  const engine = useProductEngine(product);
  return (
    <ProductEngineCtx.Provider value={engine}>
      {children}
    </ProductEngineCtx.Provider>
  );
}

/**
 * Read the product engine. Throws if no provider in tree.
 * Use on shop-product pages where ProductEngineProvider is guaranteed.
 */
export function useProductEngineContext(): ProductEngine {
  const ctx = useContext(ProductEngineCtx);
  if (!ctx) {
    throw new Error(
      "useProductEngineContext must be used within ProductEngineProvider",
    );
  }
  return ctx;
}

/**
 * Optionally read the product engine. Returns null if no provider.
 * Use in shared renderers (e.g. ProductGalleryRenderer) that render
 * on both shop-product pages (with engine) and accommodation pages (without).
 */
export function useOptionalProductEngineContext(): ProductEngine | null {
  return useContext(ProductEngineCtx);
}
