"use client";

/**
 * Product Context
 * ═══════════════
 *
 * Provides the current product data to product-page sections and elements.
 * Elements like product-title and product-description read from this context
 * instead of having their own content fields.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface ProductContextData {
  id: string;
  title: string;
  description: string;
  slug: string;
  images: string[];
  price: number;
  currency: string;
  productType: string;
  facilities: string[];
  maxGuests: number | null;
}

const ProductContext = createContext<ProductContextData | null>(null);

export function ProductProvider({
  product,
  children,
}: {
  product: ProductContextData;
  children: ReactNode;
}) {
  return (
    <ProductContext.Provider value={product}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProduct(): ProductContextData | null {
  return useContext(ProductContext);
}
