/**
 * Check-In Cards — Type System
 * ════════════════════════════
 *
 * Platform-defined form cards for the check-in guest flow.
 * Tenants choose which cards are active and in what order.
 * The platform owns ALL content, styling, validation, and logic.
 *
 * Three layers:
 *   CheckinCardDefinition — platform blueprint (code-level constant)
 *   CheckinCardConfig     — tenant choices (stored in TenantConfig)
 *   CheckinCardData       — runtime data collected from guest
 */

// ── Card IDs ─────────────────────────────────────────────────

export type CheckinCardId =
  | "signature"
  | "phone"
  | "guestCount"
  | "licensePlate"
  | "purposeOfStay"
  | "idVerification"
  | "estimatedArrival";

// ── Card Definition (platform-owned) ─────────────────────────

export type CheckinCardDefinition = {
  /** Unique card identifier. */
  id: CheckinCardId;
  /** Display label (Swedish). */
  label: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Platform version — increment on breaking changes. */
  version: string;
  /** Whether this card can be disabled by tenants. false = always on. */
  optional: boolean;
  /** Default enabled state for new tenants. */
  defaultEnabled: boolean;
  /** Default sort position (0-based). */
  defaultSortOrder: number;
};

// ── Tenant Config (what tenants control) ─────────────────────

export type CheckinCardConfig = {
  /** Ordered list of card IDs. Determines render order. Only listed cards are active. */
  cardOrder: CheckinCardId[];
  /** Per-card optional/required overrides. Missing = use definition default. */
  cardOptional?: Partial<Record<CheckinCardId, boolean>>;
};

// ── Runtime Data (collected from guest) ──────────────────────

export type CheckinCardData = {
  signature?: string;       // base64 data URL
  phone?: string;           // E.164 or local format
  guestCount?: number;
  licensePlate?: string;
  purposeOfStay?: string;   // "semester" | "business" | "konferens" | "annat"
  idVerification?: string;  // ID/passport number
  estimatedArrival?: string; // HH:MM format
};

// ── Card Component Contract (client-only) ────────────────────

export type CheckinCardComponentProps = {
  /** Current value for this card's data. */
  value: unknown;
  /** Callback to update this card's data. */
  onChange: (value: unknown) => void;
  /** Report whether this card's data is valid/complete. */
  onValidChange: (valid: boolean) => void;
  /** Whether the form is being submitted (disable inputs). */
  disabled: boolean;
  /** Whether this card is optional (shows "Valfritt" label). */
  optional: boolean;
  /** When true, card should display its validation error (if any). */
  showError?: boolean;
};
