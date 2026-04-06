"use client";

/**
 * Product Context
 * ═══════════════
 *
 * Provides the current product data to product-page sections and elements.
 * Elements like product-title and product-description read from this context
 * instead of having their own content fields.
 *
 * Uses a discriminated union on productType so accommodation-specific fields
 * (ratePlans, facilities, capacity) only exist on ACCOMMODATION contexts,
 * and standard-product fields (options, variants) only on STANDARD contexts.
 */

import { createContext, useContext, type ReactNode } from "react";

// ── Shared sub-types ──────────────────────────────────────────

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

export interface ResolvedProductOption {
  id: string;
  name: string;
  values: string[];
}

export interface ResolvedProductVariant {
  id: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  sku: string | null;
  trackInventory: boolean;
  inventoryQuantity: number;
  continueSellingWhenOutOfStock: boolean;
}

// ── Discriminated union ───────────────────────────────────────

interface BaseProductContext {
  tenantId: string;
  id: string;
  title: string;
  description: string;
  slug: string;
  images: string[];
  price: number;
  currency: string;
  productType: "STANDARD" | "ACCOMMODATION" | "GIFT_CARD";
}

export interface AccommodationProductContext extends BaseProductContext {
  productType: "ACCOMMODATION";
  facilities: string[];
  highlights: ProductHighlight[];
  ratePlans: ProductRatePlan[];
  maxGuests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  roomSizeSqm: number | null;
  extraBeds: number;
}

export interface StandardProductContext extends BaseProductContext {
  productType: "STANDARD";
  options: ResolvedProductOption[];
  variants: ResolvedProductVariant[];
  compareAtPrice: number | null;
  trackInventory: boolean;
  inventoryQuantity: number;
  continueSellingWhenOutOfStock: boolean;
}

export type ProductContextData = AccommodationProductContext | StandardProductContext;

// ── Context ───────────────────────────────────────────────────

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
