import { describe, expect, it } from "vitest";

import {
  ConsentCategoriesSchema,
  STOREFRONT_EVENT_CATEGORIES,
  UnknownStorefrontEventError,
  eventCategoryFor,
  isEventConsented,
  parseConsentCategories,
  type ConsentCategories,
} from "./consent";
import { ANALYTICS_EVENT_REGISTRY } from "./schemas/registry";

const allConsented: ConsentCategories = {
  essential: true,
  analytics: true,
  marketing: true,
};

const onlyEssential: ConsentCategories = {
  essential: true,
  analytics: false,
  marketing: false,
};

describe("ConsentCategoriesSchema", () => {
  it("accepts the canonical all-true consent object", () => {
    expect(ConsentCategoriesSchema.parse(allConsented)).toEqual(allConsented);
  });

  it("accepts essential=true with analytics+marketing both off", () => {
    expect(ConsentCategoriesSchema.parse(onlyEssential)).toEqual(onlyEssential);
  });

  it("rejects essential=false (essential is non-disableable, schema enforces literal true)", () => {
    expect(() =>
      ConsentCategoriesSchema.parse({
        essential: false,
        analytics: true,
        marketing: true,
      }),
    ).toThrow();
  });

  it("rejects missing categories", () => {
    expect(() =>
      ConsentCategoriesSchema.parse({ essential: true, analytics: true }),
    ).toThrow();
  });

  it("rejects non-boolean category values", () => {
    expect(() =>
      ConsentCategoriesSchema.parse({
        essential: true,
        analytics: "yes",
        marketing: false,
      }),
    ).toThrow();
  });

  it("rejects entirely wrong shapes", () => {
    expect(() => ConsentCategoriesSchema.parse(null)).toThrow();
    expect(() => ConsentCategoriesSchema.parse("yes")).toThrow();
    expect(() => ConsentCategoriesSchema.parse([true, true, true])).toThrow();
  });
});

describe("parseConsentCategories", () => {
  it("returns a typed ConsentCategories on valid input", () => {
    const out = parseConsentCategories(allConsented);
    expect(out.essential).toBe(true);
    expect(out.analytics).toBe(true);
    expect(out.marketing).toBe(true);
  });

  it("throws on invalid input (dispatch endpoint translates to 400)", () => {
    expect(() => parseConsentCategories({ analytics: true })).toThrow();
  });
});

describe("STOREFRONT_EVENT_CATEGORIES", () => {
  it("covers exactly the seven storefront events", () => {
    const keys = Object.keys(STOREFRONT_EVENT_CATEGORIES).sort();
    expect(keys).toEqual(
      [
        "accommodation_viewed",
        "availability_searched",
        "cart_abandoned",
        "cart_started",
        "cart_updated",
        "checkout_started",
        "page_viewed",
      ].sort(),
    );
  });

  it("classifies every storefront event as 'analytics'", () => {
    for (const category of Object.values(STOREFRONT_EVENT_CATEGORIES)) {
      expect(category).toBe("analytics");
    }
  });

  it("every storefront event is also registered in ANALYTICS_EVENT_REGISTRY", () => {
    // Cross-check: dispatch endpoint requires both lookups to succeed.
    // A storefront event that's missing from the registry would be
    // accepted by consent and rejected by the emitter — confusing.
    for (const eventName of Object.keys(STOREFRONT_EVENT_CATEGORIES)) {
      expect(ANALYTICS_EVENT_REGISTRY).toHaveProperty(eventName);
    }
  });
});

describe("eventCategoryFor", () => {
  it("returns 'analytics' for every storefront event", () => {
    for (const eventName of Object.keys(STOREFRONT_EVENT_CATEGORIES)) {
      expect(eventCategoryFor(eventName)).toBe("analytics");
    }
  });

  it("throws UnknownStorefrontEventError for server-emitted events", () => {
    // booking_completed is a real registered event but emitted server-
    // side and therefore must NEVER reach the dispatch endpoint.
    expect(() => eventCategoryFor("booking_completed")).toThrow(
      UnknownStorefrontEventError,
    );
    expect(() => eventCategoryFor("payment_succeeded")).toThrow(
      UnknownStorefrontEventError,
    );
  });

  it("throws UnknownStorefrontEventError for unknown event names", () => {
    expect(() => eventCategoryFor("not_a_real_event")).toThrow(
      UnknownStorefrontEventError,
    );
  });

  it("error message instructs developers where to add new events", () => {
    try {
      eventCategoryFor("future_storefront_event");
      expect.fail("expected eventCategoryFor to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownStorefrontEventError);
      expect((err as Error).message).toContain("STOREFRONT_EVENT_CATEGORIES");
      expect((err as Error).message).toContain("consent.ts");
    }
  });
});

describe("isEventConsented", () => {
  it("returns true for storefront events when analytics is granted", () => {
    expect(isEventConsented("page_viewed", allConsented)).toBe(true);
    expect(isEventConsented("cart_abandoned", allConsented)).toBe(true);
  });

  it("returns false for storefront events when analytics is declined", () => {
    expect(isEventConsented("page_viewed", onlyEssential)).toBe(false);
    expect(isEventConsented("checkout_started", onlyEssential)).toBe(false);
  });

  it("ignores marketing flag (no storefront event lives in marketing yet)", () => {
    const marketingOnly: ConsentCategories = {
      essential: true,
      analytics: false,
      marketing: true,
    };
    expect(isEventConsented("page_viewed", marketingOnly)).toBe(false);
  });

  it("throws for non-storefront event names (dispatch routing bug)", () => {
    expect(() => isEventConsented("booking_completed", allConsented)).toThrow(
      UnknownStorefrontEventError,
    );
  });
});
