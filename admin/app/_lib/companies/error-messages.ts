/**
 * Map ServiceError (and unknown errors) to Swedish user-facing messages.
 *
 * Used by the Companies admin write flows (server actions + inline cards) so
 * every error surface speaks the same language. Each mapping keys on the
 * error's `code` plus — where useful — its `context` bag, so we can pick a
 * more specific message than the generic one the service provides.
 *
 * New mappings are cheap: extend the switch + add a unit test.
 */

import {
  ConflictError,
  NotFoundError,
  ServiceError,
  UnauthorizedError,
  ValidationError,
  isServiceError,
} from "@/app/_lib/errors/service-errors";

const UNKNOWN = "Ett oväntat fel inträffade. Försök igen.";

export function mapServiceErrorToMessage(err: unknown): string {
  if (!isServiceError(err)) {
    // Plain Error — surface its message if it looks like a Swedish sentence;
    // otherwise fall back to the generic unknown message.
    if (err instanceof Error && /[a-zåäö]/i.test(err.message)) {
      return err.message;
    }
    return UNKNOWN;
  }

  // ConflictError paths ------------------------------------------------
  if (err instanceof ConflictError) {
    const ctx = err.context ?? {};
    if (ctx.prismaCode === "UNIQUE_VIOLATION") {
      const target = typeof ctx.target === "string" ? ctx.target : "";
      if (target.includes("externalId")) {
        return "Externt ID används redan av ett annat företag";
      }
      if (target.includes("email")) {
        return "E-posten är redan registrerad";
      }
      return "Värdet måste vara unikt — det finns redan en post med samma uppgifter";
    }
    // Guest-already-in-company is signalled by the service with a
    // `conflictCompanyId` context key. We include the id so the UI can
    // resolve the company name and splice it into the message.
    if (typeof ctx.conflictCompanyId === "string") {
      return (
        "Gästen är redan kontakt hos ett annat företag" +
        (ctx.conflictCompanyName
          ? `: ${String(ctx.conflictCompanyName)}`
          : "")
      );
    }
    return err.message;
  }

  // ValidationError paths ----------------------------------------------
  if (err instanceof ValidationError) {
    const ctx = err.context ?? {};
    if (ctx.prismaCode === "FK_VIOLATION") {
      return "Referensen finns inte";
    }
    if (ctx.polymorphicXor === "XOR_VIOLATION") {
      return "Exakt en av produkt, boende eller samling måste anges";
    }
    if (ctx.polymorphicXor === "REF_TYPE_NOT_ALLOWED") {
      return "Den här typen av referens är inte tillåten här";
    }
    // Services already speak Swedish for domain rule violations; surface
    // their message directly so context-specific copy ("Beloppet måste
    // vara större än 0") reaches the user unchanged.
    return err.message;
  }

  // NotFoundError ------------------------------------------------------
  if (err instanceof NotFoundError) {
    return "Hittades inte";
  }

  // UnauthorizedError --------------------------------------------------
  if (err instanceof UnauthorizedError) {
    return "Du saknar behörighet för den här åtgärden";
  }

  // Fallback for ServiceError with unknown subclass.
  return (err as ServiceError).message || UNKNOWN;
}
