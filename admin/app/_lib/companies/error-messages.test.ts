import { describe, it, expect } from "vitest";
import { mapServiceErrorToMessage } from "./error-messages";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../errors/service-errors";

describe("mapServiceErrorToMessage", () => {
  it("maps UNIQUE_VIOLATION on externalId to a specific message", () => {
    const err = new ConflictError("duplicate", {
      prismaCode: "UNIQUE_VIOLATION",
      target: "tenantId,externalId",
    });
    expect(mapServiceErrorToMessage(err)).toBe(
      "Externt ID används redan av ett annat företag",
    );
  });

  it("maps guest-already-in-company ConflictError with company name", () => {
    const err = new ConflictError("already contact", {
      conflictCompanyId: "co_other",
      conflictCompanyName: "Andra AB",
    });
    expect(mapServiceErrorToMessage(err)).toBe(
      "Gästen är redan kontakt hos ett annat företag: Andra AB",
    );
  });

  it("maps guest-already-in-company without company name gracefully", () => {
    const err = new ConflictError("already contact", {
      conflictCompanyId: "co_other",
    });
    expect(mapServiceErrorToMessage(err)).toBe(
      "Gästen är redan kontakt hos ett annat företag",
    );
  });

  it("maps FK_VIOLATION to a generic reference-missing message", () => {
    const err = new ValidationError("fk broken", {
      prismaCode: "FK_VIOLATION",
    });
    expect(mapServiceErrorToMessage(err)).toBe("Referensen finns inte");
  });

  it("maps POLYMORPHIC_XOR to a domain-specific message", () => {
    const err = new ValidationError("bad ref", {
      polymorphicXor: "XOR_VIOLATION",
    });
    expect(mapServiceErrorToMessage(err)).toBe(
      "Exakt en av produkt, boende eller samling måste anges",
    );
  });

  it("surfaces ValidationError message verbatim when no matching code", () => {
    const err = new ValidationError("Beloppet måste vara större än 0");
    expect(mapServiceErrorToMessage(err)).toBe(
      "Beloppet måste vara större än 0",
    );
  });

  it("maps NotFoundError to a generic Swedish fallback", () => {
    expect(mapServiceErrorToMessage(new NotFoundError("x"))).toBe(
      "Hittades inte",
    );
  });

  it("maps UnauthorizedError", () => {
    expect(mapServiceErrorToMessage(new UnauthorizedError("nope"))).toBe(
      "Du saknar behörighet för den här åtgärden",
    );
  });

  it("maps unknown non-error values to the generic fallback", () => {
    expect(mapServiceErrorToMessage(null)).toBe(
      "Ett oväntat fel inträffade. Försök igen.",
    );
    expect(mapServiceErrorToMessage(12345)).toBe(
      "Ett oväntat fel inträffade. Försök igen.",
    );
  });
});
