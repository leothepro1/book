/**
 * Checkout Session Types
 * ══════════════════════
 *
 * Shared types for the checkout session lifecycle.
 * Source of truth for the session data shape.
 */

/** Mirrors Prisma CheckoutSessionStatus enum */
export type CheckoutSessionStatus =
  | "PENDING"
  | "ADDON_SELECTION"
  | "CHECKOUT"
  | "COMPLETED"
  | "EXPIRED"
  | "ABANDONED";

/** Frozen accommodation data stored on the session */
export type CheckoutSessionSnapshot = {
  accommodationName: string;
  accommodationSlug: string;
  ratePlanId: string;
  ratePlanName: string;
  ratePlanCancellationPolicy: string;
  pricePerNight: number;   // öre
  totalNights: number;
  accommodationTotal: number; // öre
  currency: string;
};

/** Shape of each entry in selectedAddons JSON array */
export type SelectedAddon = {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitAmount: number;    // öre
  totalAmount: number;   // öre
  pricingMode: string;
  currency: string;
};

/** POST /api/portal/checkout/session response */
export type CreateCheckoutSessionResponse = {
  token: string;
  redirect: string;
  hasAddons: boolean;
};
