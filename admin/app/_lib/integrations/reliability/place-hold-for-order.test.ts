import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────

const mockBookingFindFirst = vi.fn();
const mockBookingFindUnique = vi.fn();
const mockBookingUpdate = vi.fn();
const mockAccommodationFindFirst = vi.fn();

// Idempotency wrapper short-circuits in tests: we mock the create
// to always succeed (new key) so the wrapped fn runs, and the
// follow-up update just resolves. The wrapper's happy-path lets the
// underlying adapter call reach its mock normally.
const mockIdempotencyKeyCreate = vi.fn<(arg?: unknown) => Promise<{ id: string }>>(
  async () => ({ id: "idem_row" }),
);
const mockIdempotencyKeyUpdate = vi.fn<(arg?: unknown) => Promise<unknown>>(
  async () => ({}),
);

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    booking: {
      findFirst: (...a: unknown[]) => mockBookingFindFirst(...a),
      findUnique: (...a: unknown[]) => mockBookingFindUnique(...a),
      update: (...a: unknown[]) => mockBookingUpdate(...a),
    },
    accommodation: {
      findFirst: (...a: unknown[]) => mockAccommodationFindFirst(...a),
    },
    pmsIdempotencyKey: {
      create: (...a: unknown[]) => mockIdempotencyKeyCreate(...a),
      findUnique: vi.fn(),
      update: (...a: unknown[]) => mockIdempotencyKeyUpdate(...a),
    },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

const mockHoldAvailability = vi.fn();
vi.mock("../resolve", () => ({
  resolveAdapter: vi.fn(async () => ({
    provider: "fake",
    holdAvailability: (...a: unknown[]) => mockHoldAvailability(...a),
  })),
}));

const { placeHoldForOrder } = await import("./place-hold-for-order");

// ── Fixtures ────────────────────────────────────────────────

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk_1",
    holdExternalId: null,
    accommodationId: "acc_1",
    ratePlanId: "rate_1",
    checkIn: new Date("2026-05-01"),
    checkOut: new Date("2026-05-03"),
    guestCount: 2,
    firstName: "",
    lastName: "",
    guestEmail: "",
    phone: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBookingUpdate.mockResolvedValue({});
  mockAccommodationFindFirst.mockResolvedValue({ externalId: "mews-cat-1" });
});

// ── Tests ───────────────────────────────────────────────────

describe("placeHoldForOrder", () => {
  it("places a hold and persists holdExternalId + holdExpiresAt", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(makeBooking());
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    mockHoldAvailability.mockResolvedValueOnce({
      externalId: "hold-xyz",
      expiresAt,
    });

    const result = await placeHoldForOrder({
      orderId: "o1",
      tenantId: "t1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("hold");
      expect(result.holdExternalId).toBe("hold-xyz");
    }

    const updateArgs = mockBookingUpdate.mock.calls[0][0];
    expect(updateArgs.data.holdExternalId).toBe("hold-xyz");
    expect(updateArgs.data.holdExpiresAt).toEqual(expiresAt);
  });

  it("returns provider='not_supported' when the adapter returns null", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(makeBooking());
    mockHoldAvailability.mockResolvedValueOnce(null);

    const result = await placeHoldForOrder({
      orderId: "o1",
      tenantId: "t1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("not_supported");
      expect(result.holdExternalId).toBeNull();
    }
    expect(mockBookingUpdate).not.toHaveBeenCalled();
  });

  it("returns ok:false when adapter throws", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(makeBooking());
    mockHoldAvailability.mockRejectedValueOnce(new Error("Mews 503"));

    const result = await placeHoldForOrder({
      orderId: "o1",
      tenantId: "t1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Mews 503");
    }
  });

  it("is idempotent: existing holdExternalId skips the adapter call", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(
      makeBooking({ holdExternalId: "hold-already" }),
    );
    mockBookingFindUnique.mockResolvedValueOnce({
      holdExpiresAt: new Date(Date.now() + 10 * 60_000),
    });

    const result = await placeHoldForOrder({
      orderId: "o1",
      tenantId: "t1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.holdExternalId).toBe("hold-already");
    }
    expect(mockHoldAvailability).not.toHaveBeenCalled();
    expect(mockBookingUpdate).not.toHaveBeenCalled();
  });

  it("degrades to not_supported when accommodation has no externalId", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(makeBooking());
    mockAccommodationFindFirst.mockResolvedValueOnce({ externalId: null });

    const result = await placeHoldForOrder({
      orderId: "o1",
      tenantId: "t1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("not_supported");
    }
    expect(mockHoldAvailability).not.toHaveBeenCalled();
  });

  it("returns ok:false when no Booking is linked", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(null);

    const result = await placeHoldForOrder({
      orderId: "o_missing",
      tenantId: "t1",
    });

    expect(result.ok).toBe(false);
  });

  it("clamps hold duration to [5 min, 60 min]", async () => {
    mockBookingFindFirst.mockResolvedValueOnce(makeBooking());
    mockHoldAvailability.mockResolvedValueOnce({
      externalId: "hold-clamp",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });

    await placeHoldForOrder({
      orderId: "o1",
      tenantId: "t1",
      holdDurationMs: 999 * 60_000, // way too long
    });

    const passedMs = mockHoldAvailability.mock.calls[0][1].holdDurationMs;
    expect(passedMs).toBeLessThanOrEqual(60 * 60_000);
  });
});
