"use client";

/**
 * Shop Product Provider
 * ═════════════════════
 *
 * Wraps the section system with everything a standard product page needs:
 *   1. ProductProvider — product data via useProduct()
 *   2. ProductEngineProvider — variant/price/inventory engine
 *
 * Parallel to how stays/[slug]/page.tsx wraps ThemeRenderer with
 * ProductProvider + CommerceEngineProvider for accommodations.
 *
 * CartProvider is NOT included here — it's already in shop/layout.tsx
 * which wraps all /shop/* routes.
 */

import type { ReactNode } from "react";
import { ProductProvider } from "./ProductContext";
import type { StandardProductContext } from "./ProductContext";
import { ProductEngineProvider } from "@/app/_lib/products/engine";

export function ShopProductProvider({
  product,
  children,
}: {
  product: StandardProductContext;
  children: ReactNode;
}) {
  return (
    <ProductProvider product={product}>
      <ProductEngineProvider product={product}>
        {children}
      </ProductEngineProvider>
    </ProductProvider>
  );
}
