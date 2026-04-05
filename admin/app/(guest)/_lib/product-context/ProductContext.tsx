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

export interface ProductHighlight {
  icon: string;
  text: string;
  description: string;
}

export interface ProductRatePlan {
  externalId: string;
  name: string;
  description: string;
  cancellationPolicy: string;
  cancellationDescription: string;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  includedAddons: Array<{ addonId: string; name: string; quantity: number }>;
}

export interface ProductContextData {
  tenantId: string;
  id: string;
  title: string;
  description: string;
  slug: string;
  images: string[];
  price: number;
  currency: string;
  productType: string;
  facilities: string[];
  highlights: ProductHighlight[];
  ratePlans: ProductRatePlan[];
  maxGuests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  roomSizeSqm: number | null;
  extraBeds: number;
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
