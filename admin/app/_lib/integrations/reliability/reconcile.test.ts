import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────

const mockTenantIntegrationFindUnique = vi.fn();
const mockCursorFindUnique = vi.fn();
const mockCursorUpsert = vi.fn();
const mockBookingSyncErrorUpsert = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenantIntegration: {
      findUnique: (...a: unknown[]) => mockTenantIntegrationFindUnique(...a),
    },
    reconciliationCursor: {
      findUnique: (...a: unknown[]) => mockCursorFindUnique(...a),
      upsert: (...a: unknown[]) => mockCursorUpsert(...a),
    },
    bookingSyncError: {
      upsert: (...a: unknown[]) => mockBookingSyncErrorUpsert(...a),
    },
    $queryRaw: vi.fn(),
  },
}));

const mockListBookings = vi.fn();
const mockAdapter = {
  provider: "fake",
  listBookings: (...a: unknown[]) => mockListBookings(...a),
};

vi.mock("../resolve", () => ({
  resolveAdapter: vi.fn(async () => mockAdapter),
}));

const mockIsCircuitOpen = vi.fn();
const mockRecordFailure = vi.fn();
const mockRecordSuccess = vi.fn();
vi.mock("../sync/circuit-breaker", () => ({
  isCircuitOpen: (...a: unknown[]) => mockIsCircuitOpen(...a),
  recordFailure: (...a: unknown[]) => mockRecordFailure(...a),
  recordSuccess: (...a: unknown[]) => mockRecordSuccess(...a),
}));

const mockLogSyncEvent = vi.fn();
vi.mock("../sync/log", () => ({
  logSyncEvent: (...a: unknown[]) => mockLogSyncEvent(...a),
}));

// withLock: honor a toggle so we can simulate lock contention.
let lockContended = false;
vi.mock("@/app/_lib/redis/lock", () => ({
  withLock: async (
    _key: string,
    _ttl: number,
    fn: (h: unknown) => Promise<unknown>,
    onSkip?: () => Promise<unknown>,
  ) => {
    if (lockContended) return onSkip ? await onSkip() : null;
    return fn({ key: "test", token: "t" });
  },
}));

const mockUpsertBooking = vi.fn();
vi.mock("./ingest", () => ({
  upsertBookingFromPms: (...a: unknown[]) => mockUpsertBooking(...a),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

const { reconcileTenantTier } = await import("./reconcile");

// ── Fixtures ────────────────────────────────────────────────

function makeBooking(id: string) {
  return {
    externalId: id,
    guestName: "Anna Svensson",
    guestEmail: "anna@example.com",
    guestPhone: null,
    categoryName: "Dubbelrum",
    checkIn: new Date("2026-05-01T15:00:00Z"),
    checkOut: new Date("2026-05-03T11:00:00Z"),
    guests: 2,
    status: "confirmed" as const,
    totalAmount: 200000,
    currency: "SEK",
    ratePlanName: null,
    createdAt: new Date("2026-04-20T10:00:00Z"),
    providerUpdatedAt: new Date("2026-04-22T10:00:00Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lockContended = false;

  // Default: integration exists, enabled, provider active
  mockTenantIntegrationFindUnique.mockResolvedValue({
    provider: "fake",
    reconciliationEnabled: true,
    status: "active",
  });
  mockIsCircuitOpen.mockResolvedValue(false);
  mockCursorFindUnique.mockResolvedValue(null); // fresh window
  mockCursorUpsert.mockResolvedValue({});
  // These are awaited with .catch(...) in the orchestrator so they
  // must return real promises, not undefined.
  mockRecordFailure.mockResolvedValue(undefined);
  mockRecordSuccess.mockResolvedValue(undefined);
});

// ── Skip reasons ────────────────────────────────────────────

describe("reconcileTenantTier — skip reasons", () => {
  it("skips when TenantIntegration is missing", async () => {
    mockTenantIntegrationFindUnique.mockResolvedValueOnce(null);
    const r = await reconcileTenantTier("t1", "fake", "hot");
    expect(r.skipped).toBe("integration_missing");
    expect(mockListBookings).not.toHaveBeenCalled();
  });

  it("skips when reconciliationEnabled is false", async () => {
    mockTenantIntegrationFindUnique.mockResolvedValueOnce({
      provider: "fake",
      reconciliationEnabled: false,
      status: "active",
    });
    const r = await reconcileTenantTier("t1", "fake", "hot");
    expect(r.skipped).toBe("feature_flag_disabled");
  });

  it("skips when provider is manual", async () => {
    mockTenantIntegrationFindUnique.mockResolvedValueOnce({
      provider: "manual",
      reconciliationEnabled: true,
      status: "active",
    });
    const r = await reconcileTenantTier("t1", "manual", "hot");
    expect(r.skipped).toBe("provider_not_supported");
  });

  it("skips when circuit is open", async () => {
    mockIsCircuitOpen.mockResolvedValueOnce(true);
    const r = await reconcileTenantTier("t1", "fake", "hot");
    expect(r.skipped).toBe("circuit_open");
    expect(mockListBookings).not.toHaveBeenCalled();
  });

  it("skips when the Redis lock is contended", async () => {
    lockContended = true;
    const r = await reconcileTenantTier("t1", "fake", "hot");
    expect(r.skipped).toBe("lock_contended");
    expect(mockListBookings).not.toHaveBeenCalled();
  });
});

// ── Happy path: full sweep ──────────────────────────────────

describe("reconcileTenantTier — full sweep", () => {
  it("fetches pages until nextCursor is null and marks window completed", async () => {
    mockListBookings
      .mockResolvedValueOnce({
        bookings: [makeBooking("b1"), makeBooking("b2")],
        nextCursor: "page2",
      })
      .mockResolvedValueOnce({
        bookings: [makeBooking("b3")],
        nextCursor: null,
      });

    mockUpsertBooking
      .mockResolvedValueOnce({ action: "created", bookingId: "1" })
      .mockResolvedValueOnce({ action: "updated", bookingId: "2" })
      .mockResolvedValueOnce({
        action: "unchanged_identical",
        bookingId: "3",
      });

    const r = await reconcileTenantTier("t1", "fake", "hot");

    expect(r.skipped).toBeNull();
    expect(r.pagesFetched).toBe(2);
    expect(r.bookingsScanned).toBe(3);
    expect(r.backfillCount).toBe(1);
    expect(r.updatedCount).toBe(1);
    expect(r.identicalCount).toBe(1);
    expect(r.errorCount).toBe(0);
    expect(r.windowCompleted).toBe(true);
    expect(r.fatalError).toBeNull();

    // Final cursor save should set completedAt non-null
    const finalCursorCall =
      mockCursorUpsert.mock.calls[mockCursorUpsert.mock.calls.length - 1][0];
    expect(finalCursorCall.update.completedAt).toBeInstanceOf(Date);
    expect(finalCursorCall.update.cursor).toBeNull();

    // Success must reset the circuit breaker
    expect(mockRecordSuccess).toHaveBeenCalledWith("t1", "fake");

    // Audit event fires with sync.completed
    expect(mockLogSyncEvent).toHaveBeenCalledWith(
      "t1",
      "fake",
      "sync.completed",
      expect.objectContaining({
        tier: "hot",
        bookingsScanned: 3,
        backfillCount: 1,
      }),
    );
  });

  it("counts stale rejections separately from updates", async () => {
    mockListBookings.mockResolvedValueOnce({
      bookings: [makeBooking("b1"), makeBooking("b2")],
      nextCursor: null,
    });
    mockUpsertBooking
      .mockResolvedValueOnce({ action: "unchanged_stale", bookingId: "1" })
      .mockResolvedValueOnce({ action: "unchanged_stale", bookingId: "2" });

    const r = await reconcileTenantTier("t1", "fake", "hot");
    expect(r.staleCount).toBe(2);
    expect(r.backfillCount).toBe(0);
    expect(r.updatedCount).toBe(0);
  });
});

// ── Resume from existing cursor ─────────────────────────────

describe("reconcileTenantTier — resume path", () => {
  it("resumes from stored cursor when previous window is incomplete and fresh", async () => {
    // Window must be within lookback × STALE_FACTOR of "now" to be
    // considered resumable. Use "now - 5min" so the 90-min hot-tier
    // staleness threshold is not tripped.
    const windowStart = new Date(Date.now() - 35 * 60 * 1000);
    const windowEnd = new Date(Date.now() - 5 * 60 * 1000);
    mockCursorFindUnique.mockResolvedValueOnce({
      windowStart,
      windowEnd,
      cursor: "page3",
      completedAt: null,
    });
    mockListBookings.mockResolvedValueOnce({
      bookings: [],
      nextCursor: null,
    });

    await reconcileTenantTier("t1", "fake", "hot");

    // The adapter must be called with the stored cursor, not undefined
    expect(mockListBookings.mock.calls[0][1].cursor).toBe("page3");
    expect(mockListBookings.mock.calls[0][1].from).toEqual(windowStart);
    expect(mockListBookings.mock.calls[0][1].to).toEqual(windowEnd);
  });

  it("abandons a stale window (windowEnd older than lookback × 3) and starts fresh", async () => {
    mockCursorFindUnique.mockResolvedValueOnce({
      windowStart: new Date("2025-01-01T00:00:00Z"),
      windowEnd: new Date("2025-01-01T00:30:00Z"),
      cursor: "page3",
      completedAt: null, // still "in progress" but ancient
    });
    mockListBookings.mockResolvedValueOnce({
      bookings: [],
      nextCursor: null,
    });

    await reconcileTenantTier("t1", "fake", "hot");

    // Stale window → starts fresh. cursor=undefined, window.to ≈ now
    expect(mockListBookings.mock.calls[0][1].cursor).toBeUndefined();
    const windowToSec = mockListBookings.mock.calls[0][1].to.getTime() / 1000;
    const nowSec = Date.now() / 1000;
    expect(Math.abs(windowToSec - nowSec)).toBeLessThan(5);
  });

  it("starts a fresh window when previous cursor is complete", async () => {
    mockCursorFindUnique.mockResolvedValueOnce({
      windowStart: new Date("2026-04-22T09:00:00Z"),
      windowEnd: new Date("2026-04-22T09:30:00Z"),
      cursor: null,
      completedAt: new Date("2026-04-22T09:30:01Z"),
    });
    mockListBookings.mockResolvedValueOnce({
      bookings: [],
      nextCursor: null,
    });

    await reconcileTenantTier("t1", "fake", "hot");

    // Fresh window — cursor is undefined, window.to is near now
    expect(mockListBookings.mock.calls[0][1].cursor).toBeUndefined();
    const windowToSec = mockListBookings.mock.calls[0][1].to.getTime() / 1000;
    const nowSec = Date.now() / 1000;
    expect(Math.abs(windowToSec - nowSec)).toBeLessThan(5);
  });
});

// ── Per-booking failure ─────────────────────────────────────

describe("reconcileTenantTier — per-booking failures", () => {
  it("records BookingSyncError and continues when one ingest throws", async () => {
    mockListBookings.mockResolvedValueOnce({
      bookings: [makeBooking("b1"), makeBooking("b2"), makeBooking("b3")],
      nextCursor: null,
    });
    mockUpsertBooking
      .mockResolvedValueOnce({ action: "created", bookingId: "1" })
      .mockRejectedValueOnce(new Error("DB down"))
      .mockResolvedValueOnce({ action: "created", bookingId: "3" });
    mockBookingSyncErrorUpsert.mockResolvedValue({});

    const r = await reconcileTenantTier("t1", "fake", "hot");

    expect(r.backfillCount).toBe(2);
    expect(r.errorCount).toBe(1);
    expect(r.fatalError).toBeNull();
    expect(mockBookingSyncErrorUpsert).toHaveBeenCalledOnce();

    const errorArgs = mockBookingSyncErrorUpsert.mock.calls[0][0];
    expect(errorArgs.where.tenantId_externalId.externalId).toBe("b2");
  });
});

// ── Adapter failure ─────────────────────────────────────────

describe("reconcileTenantTier — adapter failure", () => {
  it("records circuit-breaker failure and returns fatalError when listBookings throws", async () => {
    mockListBookings.mockRejectedValueOnce(new Error("Mews 503"));

    const r = await reconcileTenantTier("t1", "fake", "hot");

    expect(r.fatalError).toContain("Mews 503");
    expect(r.windowCompleted).toBe(false);
    expect(mockRecordFailure).toHaveBeenCalledWith(
      "t1",
      "fake",
      expect.stringContaining("Mews 503"),
    );

    // Cursor saved with the error message so operators can see it
    const errorCall = mockCursorUpsert.mock.calls.find(
      (c) => c[0].update.lastError !== null,
    );
    expect(errorCall).toBeDefined();
    expect(errorCall![0].update.lastError).toContain("Mews 503");

    // sync.failed event, not sync.completed
    expect(mockLogSyncEvent).toHaveBeenCalledWith(
      "t1",
      "fake",
      "sync.failed",
      expect.any(Object),
    );
  });
});
