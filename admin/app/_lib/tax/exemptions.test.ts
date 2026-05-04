import { describe, it, expect } from "vitest";
import { TAX_EXEMPTION_CODES, type TaxExemptionCode } from "./exemptions";

describe("TaxExemptionCode enum", () => {
  it("includes EU_REVERSE_CHARGE_EXEMPTION_RULE (LOCKED critical)", () => {
    expect(TAX_EXEMPTION_CODES).toContain(
      "EU_REVERSE_CHARGE_EXEMPTION_RULE",
    );
  });

  it("covers all 50 US states + DC reseller exemption", () => {
    const stateAbbrevs = [
      "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC",
      "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
      "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
      "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
      "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
      "VT", "VA", "WA", "WV", "WI", "WY",
    ];
    expect(stateAbbrevs).toHaveLength(51);
    for (const abbr of stateAbbrevs) {
      const code = `US_${abbr}_RESELLER_EXEMPTION` as TaxExemptionCode;
      expect(TAX_EXEMPTION_CODES).toContain(code);
    }
  });

  it("includes all CA codes per recon §B.2 snippet", () => {
    expect(TAX_EXEMPTION_CODES).toContain("CA_BC_RESELLER_EXEMPTION");
    expect(TAX_EXEMPTION_CODES).toContain("CA_STATUS_CARD_EXEMPTION");
    expect(TAX_EXEMPTION_CODES).toContain("CA_DIPLOMAT_EXEMPTION");
  });

  it("has no duplicates", () => {
    expect(new Set(TAX_EXEMPTION_CODES).size).toBe(
      TAX_EXEMPTION_CODES.length,
    );
  });

  it("count snapshot — 1 EU + 51 US + 3 CA = 55", () => {
    expect(TAX_EXEMPTION_CODES).toHaveLength(55);
  });
});
