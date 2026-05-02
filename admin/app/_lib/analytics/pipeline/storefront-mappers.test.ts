/**
 * Storefront-mappers unit tests.
 *
 * Two narrow surfaces: the AccommodationType → schema-enum mapper and
 * the JS-Date → tenant-civil-date converter. These tests guard the
 * contract that `accommodation_viewed` and `availability_searched`
 * docstrings reference.
 */

import { describe, expect, it } from "vitest";
import { AccommodationType } from "@prisma/client";

import {
  accommodationTypeToSchema,
  toTenantCivilDate,
} from "./storefront-mappers";

describe("accommodationTypeToSchema", () => {
  it("maps HOTEL → hotel", () => {
    expect(accommodationTypeToSchema(AccommodationType.HOTEL)).toBe("hotel");
  });

  it("maps CABIN → cabin", () => {
    expect(accommodationTypeToSchema(AccommodationType.CABIN)).toBe("cabin");
  });

  it("maps CAMPING → camping", () => {
    expect(accommodationTypeToSchema(AccommodationType.CAMPING)).toBe("camping");
  });

  it("maps APARTMENT → apartment", () => {
    expect(accommodationTypeToSchema(AccommodationType.APARTMENT)).toBe(
      "apartment",
    );
  });

  it("maps PITCH → pitch", () => {
    expect(accommodationTypeToSchema(AccommodationType.PITCH)).toBe("pitch");
  });
});

describe("toTenantCivilDate", () => {
  it("formats a UTC instant as YYYY-MM-DD in Europe/Stockholm", () => {
    // 2026-06-15 12:00 UTC → 14:00 Stockholm (UTC+2 in summer) → 2026-06-15
    const d = new Date("2026-06-15T12:00:00.000Z");
    expect(toTenantCivilDate(d, "Europe/Stockholm")).toBe("2026-06-15");
  });

  it("handles the spring-forward DST boundary in Stockholm (2026-03-29)", () => {
    // DST in Sweden begins at 02:00 local on the last Sunday of March.
    // 2026-03-29 03:00 UTC = 05:00 Stockholm (already in DST). The
    // civil date in Stockholm is 2026-03-29 — the wall-clock skip from
    // 02:00 to 03:00 is the day before midnight in this case.
    const d = new Date("2026-03-29T03:00:00.000Z");
    expect(toTenantCivilDate(d, "Europe/Stockholm")).toBe("2026-03-29");
  });

  it("crosses to the next civil day when summer Stockholm is past midnight (2026-06-15 23:30 UTC → 2026-06-16)", () => {
    // Summer Sweden is UTC+2. 23:30 UTC = 01:30 next day Stockholm.
    const d = new Date("2026-06-15T23:30:00.000Z");
    expect(toTenantCivilDate(d, "Europe/Stockholm")).toBe("2026-06-16");
  });

  it("produces different civil dates for the same UTC instant in America/New_York vs Europe/Stockholm near midnight", () => {
    // 2026-07-15 02:00 UTC:
    //   - Stockholm (UTC+2) → 2026-07-15 04:00 → date 2026-07-15
    //   - New York (UTC-4) → 2026-07-14 22:00 → date 2026-07-14
    const d = new Date("2026-07-15T02:00:00.000Z");
    expect(toTenantCivilDate(d, "Europe/Stockholm")).toBe("2026-07-15");
    expect(toTenantCivilDate(d, "America/New_York")).toBe("2026-07-14");
  });
});
