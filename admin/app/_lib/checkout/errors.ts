/**
 * Checkout Engine — Error Types
 * ═════════════════════════════
 *
 * Typed error class for checkout failures.
 * The engine catches CheckoutError and returns a consistent
 * JSON response with error code + HTTP status.
 */

export type CheckoutErrorCode =
  | "RATE_LIMITED"
  | "TENANT_NOT_FOUND"
  | "INVALID_PARAMS"
  | "PRODUCT_NOT_FOUND"
  | "GIFT_CARDS_DISABLED"
  | "INVALID_AMOUNT"
  | "INVALID_DESIGN"
  | "INVALID_PRICE"
  | "INVALID_CURRENCY"
  | "CART_INVALID"
  | "PMS_UNAVAILABLE"
  | "STRIPE_NOT_CONFIGURED"
  | "STRIPE_NOT_ACTIVE"
  | "PAYMENT_FAILED";

export class CheckoutError extends Error {
  constructor(
    public code: CheckoutErrorCode,
    message: string,
    public httpStatus: number = 400,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}
