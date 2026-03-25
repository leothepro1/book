/**
 * Payment Method Configuration — type definitions
 * ═════════════════════════════════════════════════
 *
 * The platform defines all available payment methods.
 * Tenants can enable/disable methods but cannot add new ones.
 * All methods are provided through Stripe.
 */

// ── Method identifiers ──────────────────────────────────────────

/** Every payment method the platform supports. */
export type PaymentMethodId =
  | "card"        // Visa + Mastercard (always-on)
  | "amex"        // American Express (card network toggle)
  | "klarna"      // Buy now, pay later
  | "swish"       // Local: Sweden
  | "paypal"      // Redirect
  | "google_pay"  // Wallet (client-detected)
  | "apple_pay";  // Wallet (client-detected)

export type PaymentMethodCategory =
  | "card_networks"
  | "wallets"
  | "bnpl"
  | "local"
  | "redirect";

// ── Registry definition ─────────────────────────────────────────

export type PaymentMethodDefinition = {
  id: PaymentMethodId;
  category: PaymentMethodCategory;
  /** Swedish display name */
  name: string;
  /** Swedish description */
  description: string;
  /** Material Symbols Rounded icon name, or null for custom SVG */
  icon: string | null;
  /** Custom SVG string for brand icons */
  svgIcon?: string;
  /** Stripe payment_method_types value(s) this maps to */
  stripeTypes: string[];
  /** If true, tenant cannot disable this method */
  alwaysOn: boolean;
  /** If true, requires client-side detection (wallets) */
  clientDetected: boolean;
  /** Default enabled state for new tenants */
  defaultEnabled: boolean;
  /** Countries where this method is available (ISO 3166-1), null = worldwide */
  availableCountries: string[] | null;
};

// ── Tenant configuration (stored as JSON in DB) ─────────────────

/** Shape of Tenant.paymentMethodConfig JSON column. */
export type PaymentMethodConfig = {
  /** Schema version for future migrations */
  version: 1;
  /** Map of method ID to enabled state. Missing = use platform default. */
  methods: Partial<Record<PaymentMethodId, boolean>>;
};

// ── Resolved output (for checkout routes) ───────────────────────

/** What checkout routes receive after resolving tenant config. */
export type ResolvedPaymentMethods = {
  /** Stripe payment_method_types to pass to PaymentIntent/Checkout Session */
  stripeTypes: string[];
  /** Method IDs available for client-side UI rendering */
  availableMethods: PaymentMethodId[];
  /** Whether wallet detection should run client-side */
  walletsEnabled: boolean;
  /** Whether Klarna is available as a payment type */
  klarnaEnabled: boolean;
};
