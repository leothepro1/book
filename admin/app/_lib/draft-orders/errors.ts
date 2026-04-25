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
} as const;
