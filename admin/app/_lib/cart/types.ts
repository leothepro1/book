/**
 * Cart Types
 * ══════════
 *
 * Client-side cart types. Cart is NOT a DB model — it lives in
 * localStorage and is validated server-side at checkout.
 */

export interface CartItem {
  /** Client-generated ID (crypto.randomUUID()) */
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;

  // Snapshot at add-to-cart time — re-validated at checkout
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  unitAmount: number; // ören — from effectivePrice() at add time
  currency: string;
  addedAt: string; // ISO timestamp
}

export interface Cart {
  tenantId: string;
  items: CartItem[];
  currency: string;
  updatedAt: string; // ISO timestamp
}

export type CartValidationError =
  | { type: "PRODUCT_UNAVAILABLE"; itemId: string; title: string }
  | { type: "INSUFFICIENT_STOCK"; itemId: string; title: string; available: number }
  | { type: "PRICE_CHANGED"; itemId: string; title: string; oldAmount: number; newAmount: number }
  | { type: "VARIANT_UNAVAILABLE"; itemId: string; title: string };

export interface ValidatedCartItem extends CartItem {
  /** Server-confirmed unit amount — always use this, never the client value */
  validatedUnitAmount: number;
}

export interface CartValidationResult {
  valid: boolean;
  errors: CartValidationError[];
  validatedItems: ValidatedCartItem[];
}
