import { describe, it, expect } from "vitest";
import { NORDIC_TAX_RATES, lookupRate } from "./seed-rates";

describe("lookupRate — happy paths per Nordic country", () => {
  it("SE: ACCOMMODATION_HOTEL → 12%", () => {
    expect(lookupRate("SE", "ACCOMMODATION_HOTEL")?.rate).toBe(0.12);
  });

  it("SE: RETAIL_GENERAL → 25% (standard)", () => {
    expect(lookupRate("SE", "RETAIL_GENERAL")?.rate).toBe(0.25);
  });

  it("SE: TRANSPORT_LOCAL → 6% (reduced)", () => {
    expect(lookupRate("SE", "TRANSPORT_LOCAL")?.rate).toBe(0.06);
  });

  it("NO: FOOD_RESTAURANT → 15% (reduced food)", () => {
    expect(lookupRate("NO", "FOOD_RESTAURANT")?.rate).toBe(0.15);
  });

  it("NO: ACCOMMODATION_HOTEL → 12% (reduced)", () => {
    expect(lookupRate("NO", "ACCOMMODATION_HOTEL")?.rate).toBe(0.12);
  });

  it("NO: EXPERIENCE_TOUR → 6% (cultural)", () => {
    expect(lookupRate("NO", "EXPERIENCE_TOUR")?.rate).toBe(0.06);
  });

  it("DK: ACCOMMODATION_HOTEL → 25% (flat — no reduced rates)", () => {
    expect(lookupRate("DK", "ACCOMMODATION_HOTEL")?.rate).toBe(0.25);
  });

  it("DK: TRANSPORT_LOCAL → 0% (passenger transport exempt)", () => {
    const entry = lookupRate("DK", "TRANSPORT_LOCAL");
    expect(entry?.rate).toBe(0);
    expect(entry?.jurisdictionTitle).toMatch(/passagertransport/);
  });

  it("FI: RETAIL_GENERAL → 25.5% (standard, raised Sept 2024)", () => {
    expect(lookupRate("FI", "RETAIL_GENERAL")?.rate).toBe(0.255);
  });

  it("FI: ACCOMMODATION_HOTEL → 10% (reduced)", () => {
    expect(lookupRate("FI", "ACCOMMODATION_HOTEL")?.rate).toBe(0.1);
  });

  it("FI: FOOD_RESTAURANT → 14% (reduced food)", () => {
    expect(lookupRate("FI", "FOOD_RESTAURANT")?.rate).toBe(0.14);
  });
});

describe("lookupRate — alcoholic vs non-alcoholic distinction", () => {
  it("SE: ALCOHOLIC at standard 25%, NON_ALCOHOLIC at reduced 12%", () => {
    expect(lookupRate("SE", "BEVERAGE_ALCOHOLIC")?.rate).toBe(0.25);
    expect(lookupRate("SE", "BEVERAGE_NON_ALCOHOLIC")?.rate).toBe(0.12);
  });

  it("NO: ALCOHOLIC at standard 25%, NON_ALCOHOLIC at reduced 15%", () => {
    expect(lookupRate("NO", "BEVERAGE_ALCOHOLIC")?.rate).toBe(0.25);
    expect(lookupRate("NO", "BEVERAGE_NON_ALCOHOLIC")?.rate).toBe(0.15);
  });

  it("FI: ALCOHOLIC at standard 25.5%, NON_ALCOHOLIC at reduced 14%", () => {
    expect(lookupRate("FI", "BEVERAGE_ALCOHOLIC")?.rate).toBe(0.255);
    expect(lookupRate("FI", "BEVERAGE_NON_ALCOHOLIC")?.rate).toBe(0.14);
  });

  it("DK: both ALCOHOLIC and NON_ALCOHOLIC at flat 25%", () => {
    expect(lookupRate("DK", "BEVERAGE_ALCOHOLIC")?.rate).toBe(0.25);
    expect(lookupRate("DK", "BEVERAGE_NON_ALCOHOLIC")?.rate).toBe(0.25);
  });
});

describe("lookupRate — long-stay accommodation always rate=0", () => {
  it.each(["SE", "NO", "DK", "FI"])(
    "%s: ACCOMMODATION_LONG_STAY → 0 with explanatory title",
    (country) => {
      const entry = lookupRate(country, "ACCOMMODATION_LONG_STAY");
      expect(entry?.rate).toBe(0);
      expect(entry?.jurisdictionTitle).toBeTruthy();
    },
  );

  it("SE long-stay carries SKV explanatory note", () => {
    expect(lookupRate("SE", "ACCOMMODATION_LONG_STAY")?.notes).toMatch(/SKV/);
  });

  it("NO long-stay carries explanatory note", () => {
    expect(lookupRate("NO", "ACCOMMODATION_LONG_STAY")?.notes).toMatch(
      /MVA-fritatt/,
    );
  });
});

describe("lookupRate — case-insensitive country code (Q6 LOCKED)", () => {
  it.each(["SE", "se", "Se", "sE"])(
    "country '%s' resolves to the same entry",
    (variant) => {
      const result = lookupRate(variant, "ACCOMMODATION_HOTEL");
      expect(result?.rate).toBe(0.12);
    },
  );
});

describe("lookupRate — unsupported jurisdictions", () => {
  it("country not in seed (US) → null", () => {
    expect(lookupRate("US", "RETAIL_GENERAL")).toBeNull();
  });

  it("country not in seed (DE) → null", () => {
    expect(lookupRate("DE", "ACCOMMODATION_HOTEL")).toBeNull();
  });

  it("empty country → null", () => {
    expect(lookupRate("", "RETAIL_GENERAL")).toBeNull();
  });
});

describe("NORDIC_TAX_RATES — table shape", () => {
  it("contains exactly the 4 Nordic countries", () => {
    expect(Object.keys(NORDIC_TAX_RATES).sort()).toEqual([
      "DK",
      "FI",
      "NO",
      "SE",
    ]);
  });

  it("every country covers ACCOMMODATION_HOTEL (the V1 hospitality default)", () => {
    for (const country of Object.keys(NORDIC_TAX_RATES)) {
      expect(NORDIC_TAX_RATES[country].ACCOMMODATION_HOTEL).toBeDefined();
    }
  });

  it("every country covers ACCOMMODATION_LONG_STAY (Q5 audit-trail)", () => {
    for (const country of Object.keys(NORDIC_TAX_RATES)) {
      expect(
        NORDIC_TAX_RATES[country].ACCOMMODATION_LONG_STAY,
      ).toBeDefined();
    }
  });

  it("every country covers RETAIL_GENERAL (the standard-rate baseline)", () => {
    for (const country of Object.keys(NORDIC_TAX_RATES)) {
      expect(NORDIC_TAX_RATES[country].RETAIL_GENERAL).toBeDefined();
    }
  });
});
