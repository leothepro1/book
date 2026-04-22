import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import { verifyPmsState } from "./verify-pms-state";

const mockLookup = vi.fn();
const adapter = {
  provider: "fake" as const,
  lookupBooking: (...a: unknown[]) => mockLookup(...a),
} as unknown as Parameters<typeof verifyPmsState>[0]["adapter"];

beforeEach(() => vi.clearAllMocks());

function base(overrides: Record<string, unknown> = {}) {
  return {
    externalId: "res_1",
    guestName: "Anna",
    guestEmail: "anna@example.com",
    guestPhone: null,
    categoryName: "Dubbelrum",
    checkIn: new Date("2026-05-01T15:00:00Z"),
    checkOut: new Date("2026-05-03T11:00:00Z"),
    guests: 2,
    status: "confirmed" as const,
    totalAmount: 0,
    currency: "SEK",
    ratePlanName: null,
    createdAt: new Date("2026-04-20T10:00:00Z"),
    providerUpdatedAt: new Date("2026-04-22T10:00:00Z"),
    ...overrides,
  };
}

function expected(overrides: Record<string, unknown> = {}) {
  return {
    adapter,
    tenantId: "t1",
    externalId: "res_1",
    expected: {
      checkIn: "2026-05-01",
      checkOut: "2026-05-03",
      guests: 2,
      email: "anna@example.com",
      ...overrides,
    },
  };
}

describe("verifyPmsState", () => {
  it("matches when every field aligns", async () => {
    mockLookup.mockResolvedValueOnce(base());
    const r = await verifyPmsState(expected());
    expect(r.matches).toBe(true);
  });

  it("flags pms_not_found when lookup returns null", async () => {
    mockLookup.mockResolvedValueOnce(null);
    const r = await verifyPmsState(expected());
    expect(r).toEqual({ matches: false, reason: "pms_not_found" });
  });

  it("flags state_mismatch when PMS returns a non-confirmed status", async () => {
    mockLookup.mockResolvedValueOnce(base({ status: "cancelled" }));
    const r = await verifyPmsState(expected());
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe("state_mismatch");
  });

  it("accepts checked_in and checked_out as confirmed-equivalents", async () => {
    mockLookup.mockResolvedValueOnce(base({ status: "checked_in" }));
    const r1 = await verifyPmsState(expected());
    expect(r1.matches).toBe(true);

    mockLookup.mockResolvedValueOnce(base({ status: "checked_out" }));
    const r2 = await verifyPmsState(expected());
    expect(r2.matches).toBe(true);
  });

  it("flags field_mismatch on checkIn drift (timezone bug)", async () => {
    mockLookup.mockResolvedValueOnce(
      base({ checkIn: new Date("2026-05-02T15:00:00Z") }),
    );
    const r = await verifyPmsState(expected());
    expect(r.matches).toBe(false);
    if (!r.matches && r.reason === "field_mismatch") {
      expect(r.mismatches?.find((m) => m.field === "checkIn")).toBeDefined();
    }
  });

  it("flags field_mismatch on guests count", async () => {
    mockLookup.mockResolvedValueOnce(base({ guests: 3 }));
    const r = await verifyPmsState(expected());
    expect(r.matches).toBe(false);
    if (!r.matches && r.reason === "field_mismatch") {
      expect(
        r.mismatches?.find(
          (m) => m.field === "guests" && m.actual === 3 && m.expected === 2,
        ),
      ).toBeDefined();
    }
  });

  it("flags field_mismatch on email, case-insensitive normalisation", async () => {
    mockLookup.mockResolvedValueOnce(base({ guestEmail: "different@example.com" }));
    const r = await verifyPmsState(expected());
    expect(r.matches).toBe(false);

    // Same email with different case should STILL match (normalized)
    mockLookup.mockResolvedValueOnce(base({ guestEmail: "ANNA@EXAMPLE.COM" }));
    const r2 = await verifyPmsState(expected());
    expect(r2.matches).toBe(true);
  });

  it("does not flag email mismatch when expected email is blank", async () => {
    mockLookup.mockResolvedValueOnce(base({ guestEmail: "anything@example.com" }));
    const r = await verifyPmsState(expected({ email: "" }));
    expect(r.matches).toBe(true);
  });

  it("returns adapter_unreachable when lookupBooking throws", async () => {
    mockLookup.mockRejectedValueOnce(new Error("Mews 503"));
    const r = await verifyPmsState(expected());
    expect(r.matches).toBe(false);
    if (!r.matches) {
      expect(r.reason).toBe("adapter_unreachable");
      expect((r as { adapterError?: string }).adapterError).toContain("Mews 503");
    }
  });

  it("aggregates multiple mismatches in one report", async () => {
    mockLookup.mockResolvedValueOnce(
      base({ guests: 5, guestEmail: "wrong@example.com" }),
    );
    const r = await verifyPmsState(expected());
    if (!r.matches && r.reason === "field_mismatch") {
      expect(r.mismatches).toHaveLength(2);
      const fields = r.mismatches?.map((m) => m.field);
      expect(fields).toContain("guests");
      expect(fields).toContain("guestEmail");
    }
  });
});
