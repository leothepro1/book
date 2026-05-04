import { describe, it, expect } from "vitest";
import {
  TAX_CATEGORIES,
  DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE,
  type TaxCategory,
} from "./taxonomy";
import { ProductTypeSchema } from "../../_lib/products/types";

describe("TaxCategory enum", () => {
  it("TAX_CATEGORIES has 16 values matching the type union", () => {
    expect(TAX_CATEGORIES).toHaveLength(16);
  });

  it("TAX_CATEGORIES has no duplicates", () => {
    expect(new Set(TAX_CATEGORIES).size).toBe(TAX_CATEGORIES.length);
  });

  it("snapshot — exact category list (regression guard)", () => {
    expect([...TAX_CATEGORIES]).toEqual([
      "ACCOMMODATION_HOTEL",
      "ACCOMMODATION_CAMPING",
      "ACCOMMODATION_LONG_STAY",
      "FOOD_BREAKFAST",
      "FOOD_RESTAURANT",
      "FOOD_GROCERY",
      "BEVERAGE_NON_ALCOHOLIC",
      "BEVERAGE_ALCOHOLIC",
      "TRANSPORT_LOCAL",
      "EXPERIENCE_TOUR",
      "EXPERIENCE_SPA",
      "RETAIL_GENERAL",
      "RETAIL_SOUVENIR",
      "FEE_BOOKING",
      "FEE_CLEANING",
      "FEE_OTHER",
    ]);
  });

  it("type-narrows exhaustively (compile-time guard)", () => {
    const exhaust = (cat: TaxCategory): string => {
      switch (cat) {
        case "ACCOMMODATION_HOTEL":
        case "ACCOMMODATION_CAMPING":
        case "ACCOMMODATION_LONG_STAY":
        case "FOOD_BREAKFAST":
        case "FOOD_RESTAURANT":
        case "FOOD_GROCERY":
        case "BEVERAGE_NON_ALCOHOLIC":
        case "BEVERAGE_ALCOHOLIC":
        case "TRANSPORT_LOCAL":
        case "EXPERIENCE_TOUR":
        case "EXPERIENCE_SPA":
        case "RETAIL_GENERAL":
        case "RETAIL_SOUVENIR":
        case "FEE_BOOKING":
        case "FEE_CLEANING":
        case "FEE_OTHER":
          return cat;
      }
    };
    // If a new category lands without updating this switch, tsc errors
    // at the absent default branch — that is the point.
    for (const cat of TAX_CATEGORIES) {
      expect(exhaust(cat)).toBe(cat);
    }
  });
});

describe("DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE", () => {
  it("covers every current Prisma ProductType value", () => {
    const productTypeValues = ProductTypeSchema.options;
    const mapKeys = Object.keys(
      DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE,
    );
    for (const value of productTypeValues) {
      expect(mapKeys).toContain(value);
    }
    // And the inverse — no stale keys.
    for (const key of mapKeys) {
      expect(productTypeValues).toContain(
        key as (typeof productTypeValues)[number],
      );
    }
  });

  it("maps STANDARD → RETAIL_GENERAL", () => {
    expect(DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE.STANDARD).toBe(
      "RETAIL_GENERAL",
    );
  });

  it("maps GIFT_CARD → FEE_OTHER", () => {
    expect(DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE.GIFT_CARD).toBe("FEE_OTHER");
  });

  it("every default value is a valid TaxCategory", () => {
    for (const value of Object.values(DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE)) {
      expect(TAX_CATEGORIES).toContain(value);
    }
  });
});
