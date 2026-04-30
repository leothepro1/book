/**
 * Draft-orders read-side error copy.
 *
 * Centralised so cross-tenant access and not-found return the SAME
 * error string (and the same `null` shape from `getDraft`). Never
 * leak the existence of a draft in another tenant.
 */

export const DRAFT_ERRORS = {
  TERMINAL_STATUS: (status: string) =>
    `Utkast med status ${status} kan inte ändras`,
  NOT_FOUND: "Utkastet kunde inte hittas",
  /** Intentional alias of NOT_FOUND — never leak existence across tenants. */
  CROSS_TENANT: "Utkastet kunde inte hittas",

  // ── FAS 7.2a — service-fas för /draft-orders/new ──
  NO_LINES: "Minst en rad krävs",
  INVALID_DATE_RANGE: "Ogiltigt datumintervall",
  ACCOMMODATION_UNAVAILABLE: (lineIndices: number[]) =>
    lineIndices.length === 1
      ? "1 rad har ogiltigt datum eller är inte tillgänglig"
      : `${lineIndices.length} rader har ogiltigt datum eller är inte tillgängliga`,
  INVALID_DISCOUNT: "Rabattkod ogiltig eller utgången",
  TENANT_MISMATCH: "Boende tillhör inte denna tenant",
  PRICING_FAILED: (lineIndex: number) =>
    `Prissättning misslyckades för rad ${lineIndex + 1}`,

  // ── FAS 7.2b.4b.1 — updateDraftCustomer ──
  INVALID_CUSTOMER: "Kunden kunde inte hittas",

  // ── Phase D — version CAS ──
  VERSION_CONFLICT:
    "Utkastet ändrades av en annan begäran — ladda om och försök igen",
} as const;
