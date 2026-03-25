/**
 * Checkout Engine — Type Definitions
 * ═══════════════════════════════════
 *
 * Core interface that every checkout type implements.
 * The engine handles all shared infrastructure; types provide
 * only domain-specific logic (price, validation, metadata).
 */

import type { z } from "zod";
import type { OrderType, PaymentMethod, Prisma } from "@prisma/client";

// ── Constants ───────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = ["SEK", "EUR", "NOK", "DKK"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const MIN_AMOUNT = 1000;        // 10 SEK — below this, price data is wrong
export const MAX_AMOUNT = 10_000_000;  // 100,000 SEK — requires manual review

// ── Stripe mode ─────────────────────────────────────────────────

export type StripeMode = "payment_intent" | "checkout_session";

// ── Price resolution ────────────────────────────────────────────

export type LineItemInput = {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  currency: string;
};

export type ResolvedPrice = {
  amount: number;              // smallest currency unit (ören)
  currency: SupportedCurrency;
  lineItems: LineItemInput[];
};

// ── Tenant (queried once by engine) ─────────────────────────────

export type TenantCheckoutInfo = {
  id: string;
  name: string;
  portalSlug: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  paymentMethodConfig: Prisma.JsonValue;
};

// ── Context (passed to type strategies) ─────────────────────────

export type CheckoutContext<T = unknown> = {
  tenant: TenantCheckoutInfo;
  input: T;
  req: Request;
  /** Type implementations can stash resolved data here to avoid re-queries */
  cache: Map<string, unknown>;
};

// ── Stripe metadata ─────────────────────────────────────────────

export type StripeMetadata = Record<string, string>;

// ── Checkout Session config (stripeMode: "checkout_session") ────

export type CheckoutSessionConfig = {
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  expiresInSeconds?: number;
  stripeLineItems: Array<{
    price_data: {
      currency: string;
      product_data: {
        name: string;
        description?: string;
        images?: string[];
      };
      unit_amount: number;
    };
    quantity: number;
  }>;
};

// ── PaymentIntent config (stripeMode: "payment_intent") ─────────

export type PaymentIntentConfig = {
  paymentMethodTypes: string[];
};

// ── The core interface ──────────────────────────────────────────

export interface CheckoutType<TInput> {
  /** Unique identifier — matches route segment */
  id: string;

  /** Zod schema for request body validation */
  inputSchema: z.ZodType<TInput>;

  /** Rate limit: [prefix, maxRequests, windowMs] */
  rateLimit: [string, number, number];

  /** Which Stripe primitive to create */
  stripeMode: StripeMode;

  /** Order type for the DB */
  orderType: OrderType;

  /** Payment method for the DB */
  paymentMethod: PaymentMethod;

  /** Domain-specific validation AFTER Zod. Throw CheckoutError on failure. */
  validate(ctx: CheckoutContext<TInput>): Promise<void>;

  /** Derive price server-side. ONLY source of price — never client. */
  resolvePrice(ctx: CheckoutContext<TInput>): Promise<ResolvedPrice>;

  /** Build order metadata (Order.metadata JSON). */
  buildMetadata(ctx: CheckoutContext<TInput>): Record<string, unknown>;

  /** Build Stripe metadata. Engine adds tenantId/orderId/orderNumber. */
  buildStripeMetadata(ctx: CheckoutContext<TInput>): StripeMetadata;

  /** Guest info at checkout time (may be empty for Elements flow). */
  resolveGuestInfo(input: TInput): { email: string; name: string; phone?: string };

  /** PaymentIntent mode: resolve payment method types. */
  buildIntentConfig?(ctx: CheckoutContext<TInput>): PaymentIntentConfig;

  /** Checkout Session mode: build session config. */
  buildSessionConfig?(
    ctx: CheckoutContext<TInput>,
    price: ResolvedPrice,
  ): Promise<CheckoutSessionConfig>;

  /** Post-order hook — before Stripe call. For inventory reservation etc. */
  afterOrderCreated?(orderId: string, ctx: CheckoutContext<TInput>): Promise<void>;
}

// ── Engine result types ─────────────────────────────────────────

export type CheckoutResultIntent = { clientSecret: string; orderId: string };
export type CheckoutResultSession = { url: string };
export type CheckoutResult = CheckoutResultIntent | CheckoutResultSession;
