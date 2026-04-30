/**
 * Unit tests for the operational ↔ analytics derive helpers.
 *
 * Coverage:
 *   - deriveActor across guestAccountId present/absent
 *   - deriveGuestId for both branches (CUID passthrough, email hash)
 *     including normalization (case + trim) and cross-tenant isolation
 *   - deriveSourceChannel across orderId / externalSource matrix
 *   - deriveProvider for every PaymentMethod enum value
 *   - deriveInstrument for every PaymentMethod enum value
 *   - formatAnalyticsDate UTC formatting
 */

import { describe, expect, it } from "vitest";

import {
  deriveActor,
  deriveGuestId,
  deriveInstrument,
  derivePMSAdapterType,
  deriveProvider,
  deriveSourceChannel,
  formatAnalyticsDate,
} from "./integrations";

const TENANT_A = "ctenant1aaaaaaaaaaaaaaaaa";
const TENANT_B = "ctenant1bbbbbbbbbbbbbbbbb";

describe("deriveActor", () => {
  it("returns guest with actor_id when guestAccountId is set", () => {
    expect(deriveActor({ guestAccountId: "cguest1234567890" })).toEqual({
      actor_type: "guest",
      actor_id: "cguest1234567890",
    });
  });

  it("returns anonymous when guestAccountId is null", () => {
    expect(deriveActor({ guestAccountId: null })).toEqual({
      actor_type: "anonymous",
      actor_id: null,
    });
  });
});

describe("deriveGuestId", () => {
  it("returns the CUID directly when GuestAccount is linked", () => {
    expect(
      deriveGuestId({
        tenantId: TENANT_A,
        guestAccountId: "cguest_abc",
        guestEmail: "anna@example.com",
      }),
    ).toBe("cguest_abc");
  });

  it("returns email_<16hex> when GuestAccount is null", () => {
    const id = deriveGuestId({
      tenantId: TENANT_A,
      guestAccountId: null,
      guestEmail: "anna@example.com",
    });
    expect(id).toMatch(/^email_[0-9a-f]{16}$/);
  });

  it("normalizes email (lowercase + trim) before hashing", () => {
    const a = deriveGuestId({
      tenantId: TENANT_A,
      guestAccountId: null,
      guestEmail: "Anna@Example.com",
    });
    const b = deriveGuestId({
      tenantId: TENANT_A,
      guestAccountId: null,
      guestEmail: "  anna@example.com  ",
    });
    expect(a).toBe(b);
  });

  it("produces different ids for the same email across tenants (isolation)", () => {
    const a = deriveGuestId({
      tenantId: TENANT_A,
      guestAccountId: null,
      guestEmail: "anna@example.com",
    });
    const b = deriveGuestId({
      tenantId: TENANT_B,
      guestAccountId: null,
      guestEmail: "anna@example.com",
    });
    expect(a).not.toBe(b);
  });

  it("is deterministic across 10 iterations", () => {
    const inputs = {
      tenantId: TENANT_A,
      guestAccountId: null,
      guestEmail: "anna@example.com",
    };
    const first = deriveGuestId(inputs);
    for (let i = 0; i < 10; i++) expect(deriveGuestId(inputs)).toBe(first);
  });
});

describe("deriveSourceChannel", () => {
  it('returns "direct" when orderId is set', () => {
    expect(deriveSourceChannel({ orderId: "co1", externalSource: null })).toBe(
      "direct",
    );
  });

  it('returns "direct" even when externalSource is also set (orderId wins)', () => {
    expect(
      deriveSourceChannel({ orderId: "co1", externalSource: "mews" }),
    ).toBe("direct");
  });

  it('returns "pms_import" when no orderId but externalSource is set', () => {
    expect(
      deriveSourceChannel({ orderId: null, externalSource: "mews" }),
    ).toBe("pms_import");
  });

  it('returns "pms_import" for fake adapter (test/dev events stay in pipeline)', () => {
    expect(
      deriveSourceChannel({ orderId: null, externalSource: "fake" }),
    ).toBe("pms_import");
  });

  it('returns "unknown" when both orderId and externalSource are null', () => {
    expect(
      deriveSourceChannel({ orderId: null, externalSource: null }),
    ).toBe("unknown");
  });
});

describe("deriveProvider — all PaymentMethod enum values", () => {
  const cases = [
    ["STRIPE_CHECKOUT", "stripe"],
    ["STRIPE_ELEMENTS", "stripe"],
    ["BEDFRONT_PAYMENTS_CHECKOUT", "stripe"],
    ["BEDFRONT_PAYMENTS_ELEMENTS", "stripe"],
    ["SWEDBANK_PAY", "swedbankpay"],
    ["NETS", "other"], // intentional v0.1.0 — see deriveProvider comment
    ["INVOICE", "manual"],
  ] as const;
  for (const [method, expected] of cases) {
    it(`${method} → "${expected}"`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(deriveProvider({ paymentMethod: method as any })).toBe(expected);
    });
  }
});

describe("deriveInstrument — all PaymentMethod enum values", () => {
  const cases = [
    ["STRIPE_CHECKOUT", "card"],
    ["STRIPE_ELEMENTS", "card"],
    ["BEDFRONT_PAYMENTS_CHECKOUT", "card"],
    ["BEDFRONT_PAYMENTS_ELEMENTS", "card"],
    ["SWEDBANK_PAY", "card"],
    ["NETS", "other"],
    ["INVOICE", "bank_transfer"],
  ] as const;
  for (const [method, expected] of cases) {
    it(`${method} → "${expected}"`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(deriveInstrument({ paymentMethod: method as any })).toBe(expected);
    });
  }
});

describe("formatAnalyticsDate", () => {
  it("formats UTC dates as YYYY-MM-DD", () => {
    expect(formatAnalyticsDate(new Date("2026-06-04T12:34:56Z"))).toBe(
      "2026-06-04",
    );
  });

  it("uses UTC even when local time is in a different day", () => {
    // 2026-06-04T23:00:00Z is 2026-06-05 in PST/PDT but UTC says June 4.
    expect(formatAnalyticsDate(new Date("2026-06-04T23:00:00Z"))).toBe(
      "2026-06-04",
    );
  });

  it("zero-pads single-digit months and days", () => {
    expect(formatAnalyticsDate(new Date("2026-01-05T00:00:00Z"))).toBe(
      "2026-01-05",
    );
  });
});

describe("derivePMSAdapterType — Phase 2", () => {
  it("maps 'mews' (any case) to 'mews'", () => {
    expect(derivePMSAdapterType("mews")).toBe("mews");
    expect(derivePMSAdapterType("Mews")).toBe("mews");
    expect(derivePMSAdapterType("MEWS")).toBe("mews");
  });
  it("maps 'fake' to 'fake'", () => {
    expect(derivePMSAdapterType("fake")).toBe("fake");
  });
  it("maps 'manual' to 'manual'", () => {
    expect(derivePMSAdapterType("manual")).toBe("manual");
  });
  it("maps null / undefined / unknown to 'other'", () => {
    expect(derivePMSAdapterType(null)).toBe("other");
    expect(derivePMSAdapterType(undefined)).toBe("other");
    expect(derivePMSAdapterType("apaleo")).toBe("other");
    expect(derivePMSAdapterType("")).toBe("other");
  });
});
