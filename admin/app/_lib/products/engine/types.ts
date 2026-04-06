/**
 * Product Engine Types
 * ════════════════════
 *
 * Single source of truth for standard product variant selection,
 * pricing, and inventory state. Follows the same State + Actions
 * pattern as CommerceEngine (commerce/types.ts).
 *
 * All monetary values in ören (integers). Never floats.
 */

import type { ResolvedProductVariant } from "../types";

// ─── Engine State ──────────────────────────────────────────

export interface ProductEngineState {
  // Selection
  selectedOptions: Record<string, string>;
  selectedVariant: ResolvedProductVariant | null;

  // Pricing
  price: number;
  compareAtPrice: number | null;
  activeImageUrl: string | null;

  // Inventory
  inStock: boolean;
  lowStock: boolean;
  inventoryQuantity: number;

  // Derived display
  variantTitle: string | null;
}

// ─── Engine Actions ────────────────────────────────────────

export interface ProductEngineActions {
  setOption: (name: string, value: string) => void;
  addToCart: () => void;
}

// ─── Combined ──────────────────────────────────────────────

export type ProductEngine = ProductEngineState & ProductEngineActions;
