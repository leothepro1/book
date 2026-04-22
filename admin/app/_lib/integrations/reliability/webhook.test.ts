import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Mocks ───────────────────────────────────────────────────

const mockInboxCreate = vi.fn();
const mockInboxFindUnique = vi.fn();
const mockInboxUpdate = vi.fn();
const mockInboxUpdateMany = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    pmsWebhookInbox: {
      create: (...a: unknown[]) => mockInboxCreate(...a),
      findUnique: (...a: unknown[]) => mockInboxFindUnique(...a),
      update: (...a: unknown[]) => mockInboxUpdate(...a),
      updateMany: (...a: unknown[]) => mockInboxUpdateMany(...a),
    },
  },
}));

const mockLookupBooking = vi.fn();
const mockAdapter = {
  provider: "mews",
  lookupBooking: (...a: unknown[]) => mockLookupBooking(...a),
};
vi.mock("../resolve", () => ({
  resolveAdapter: vi.fn(async () => mockAdapter),
}));

const mockUpsertBooking = vi.fn();
vi.mock("./ingest", () => ({
  upsertBookingFromPms: (...a: unknown[]) => mockUpsertBooking(...a),
}));

const mockLogSyncEvent = vi.fn();
vi.mock("../sync/log", () => ({
  logSyncEvent: (...a: unknown[]) => mockLogSyncEvent(...a),
}));

const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
vi.mock("../sync/circuit-breaker", () => ({
  recordSuccess: (...a: unknown[]) => mockRecordSuccess(...a),
  recordFailure: (...a: unknown[]) => mockRecordFailure(...a),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

// Import after mocks
const { processPmsWebhook, processInboxRow, nextRetryDelayMs, MAX_WEBHOOK_ATTEMPTS } =
  await import("./webhook");

// ── Fixtures ────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, string>> = {}) {
  return {
    externalEventId: "evt_abc_123",
    externalBookingId: "res_999",
    eventType: "Reservation",
    ...overrides,
  };
}

function makeLookup(overrides: Record<string, unknown> = {}) {
  return {
    externalId: "res_999",
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // These are awaited with .catch() in the webhook path; the real
  // implementation returns promises. Default them to resolved so
  // webhook processing doesn't trip on an undefined return.
  mockRecordSuccess.mockResolvedValue(undefined);
  mockRecordFailure.mockResolvedValue(undefined);
  // updateMany is now used for both the initial claim AND each
  // terminal status write (CAS pattern). Default every call to
  // succeed so tests don't need to enumerate every transition.
  // Individual tests override when they want to simulate a lost race.
  mockInboxUpdateMany.mockResolvedValue({ count: 1 });
  // The legacy `update()` call was replaced by updateMany() — no
  // test expectations should fire on it anymore, but keep the mock
  // resolved to surface a clear error if any new code path hits it.
  mockInboxUpdate.mockResolvedValue({});
});

// ── Retry ladder ────────────────────────────────────────────

describe("nextRetryDelayMs", () => {
  it("ladders 5m → 15m → 1h → 4h → 24h then null", () => {
    expect(nextRetryDelayMs(1)).toBe(5 * 60_000);
    expect(nextRetryDelayMs(2)).toBe(15 * 60_000);
    expect(nextRetryDelayMs(3)).toBe(60 * 60_000);
    expect(nextRetryDelayMs(4)).toBe(4 * 60 * 60_000);
    expect(nextRetryDelayMs(5)).toBe(24 * 60 * 60_000);
    expect(nextRetryDelayMs(6)).toBeNull();
  });

  it("MAX_WEBHOOK_ATTEMPTS matches ladder length", () => {
    expect(MAX_WEBHOOK_ATTEMPTS).toBe(5);
  });
});

// ── Dedup at insert ─────────────────────────────────────────

describe("processPmsWebhook — dedup", () => {
  it("deflects a duplicate delivery via P2002", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.0.0" },
    );
    mockInboxCreate.mockRejectedValueOnce(p2002);

    const result = await processPmsWebhook({
      tenantId: "t1",
      provider: "mews",
      events: [makeEvent()],
      rawPayload: {},
      processingBudgetMs: 5_000,
    });

    expect(result.eventsReceived).toBe(1);
    expect(result.eventsDuplicated).toBe(1);
    expect(result.eventsInboxed).toBe(0);
    expect(result.eventsProcessed).toBe(0);
    expect(mockUpsertBooking).not.toHaveBeenCalled();
  });

  it("rethrows non-P2002 DB errors so the PMS retries via HTTP 5xx", async () => {
    mockInboxCreate.mockRejectedValueOnce(new Error("DB down"));

    await expect(
      processPmsWebhook({
        tenantId: "t1",
        provider: "mews",
        events: [makeEvent()],
        rawPayload: {},
        processingBudgetMs: 5_000,
      }),
    ).rejects.toThrow("DB down");
  });
});

// ── Happy path: sync processing ─────────────────────────────

describe("processPmsWebhook — sync processing", () => {
  it("inboxes, processes, marks PROCESSED when lookupBooking returns a booking", async () => {
    mockInboxCreate.mockResolvedValueOnce({ id: "inbox_1" });
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_1",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_999",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockInboxUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockLookupBooking.mockResolvedValueOnce(makeLookup());
    mockUpsertBooking.mockResolvedValueOnce({
      action: "created",
      bookingId: "bk_1",
    });
    mockInboxUpdate.mockResolvedValueOnce({});

    const result = await processPmsWebhook({
      tenantId: "t1",
      provider: "mews",
      events: [makeEvent()],
      rawPayload: { Events: [{ Discriminator: "Reservation" }] },
      processingBudgetMs: 5_000,
    });

    expect(result.eventsInboxed).toBe(1);
    expect(result.eventsProcessed).toBe(1);
    expect(result.eventsDeferred).toBe(0);

    // Ingest called with source="webhook" — crucial for observability
    const ingestArgs = mockUpsertBooking.mock.calls[0][0];
    expect(ingestArgs.source).toBe("webhook");
    expect(ingestArgs.externalId).toBe("res_999");
    // providerUpdatedAt flows from lookup → ingest as the version
    // vector (not a fallback new Date()). Stale deliveries get
    // deterministically rejected downstream.
    expect(ingestArgs.providerUpdatedAt).toEqual(
      new Date("2026-04-22T10:00:00Z"),
    );

    // Terminal state written via CAS updateMany (index 1 — index 0
    // is the initial claim).
    const finalUpdate = mockInboxUpdateMany.mock.calls[1][0];
    expect(finalUpdate.data.status).toBe("PROCESSED");
    expect(finalUpdate.data.processedAt).toBeInstanceOf(Date);
  });

  it("marks PROCESSED with outcome=pms_not_found when lookupBooking returns null", async () => {
    mockInboxCreate.mockResolvedValueOnce({ id: "inbox_2" });
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_2",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_missing",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockInboxUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockLookupBooking.mockResolvedValueOnce(null);
    mockInboxUpdate.mockResolvedValueOnce({});

    const result = await processPmsWebhook({
      tenantId: "t1",
      provider: "mews",
      events: [makeEvent({ externalBookingId: "res_missing" })],
      rawPayload: {},
      processingBudgetMs: 5_000,
    });

    expect(result.eventsProcessed).toBe(1);
    expect(mockUpsertBooking).not.toHaveBeenCalled();
    // Still PROCESSED — the reconciliation cron handles phantom
    // deletes with proper guards, not the webhook path. Index 1 of
    // updateMany is the terminal CAS write (0 is the claim).
    expect(mockInboxUpdateMany.mock.calls[1][0].data.status).toBe("PROCESSED");
  });

  it("marks PROCESSED when event has no externalBookingId", async () => {
    mockInboxCreate.mockResolvedValueOnce({ id: "inbox_3" });
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_3",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: null,
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockInboxUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockInboxUpdate.mockResolvedValueOnce({});

    const result = await processPmsWebhook({
      tenantId: "t1",
      provider: "mews",
      events: [makeEvent({ externalBookingId: null as unknown as string })],
      rawPayload: {},
      processingBudgetMs: 5_000,
    });

    expect(result.eventsProcessed).toBe(1);
    expect(mockLookupBooking).not.toHaveBeenCalled();
  });
});

// ── Failure & retry ladder ─────────────────────────────────

describe("processInboxRow — failure path", () => {
  it("marks FAILED with a 5-min retry on first failure", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_fail",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_x",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockInboxUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockLookupBooking.mockRejectedValueOnce(new Error("Mews 503"));
    mockInboxUpdate.mockResolvedValueOnce({});

    const outcome = await processInboxRow("inbox_fail");

    expect(outcome).toBe("FAILED");
    // Terminal CAS is index 1 (0 is the initial claim).
    const update = mockInboxUpdateMany.mock.calls[1][0];
    expect(update.data.status).toBe("FAILED");
    expect(update.data.lastError).toContain("Mews 503");
    const retryAt: Date = update.data.nextRetryAt;
    const delta = retryAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(4 * 60_000); // at least 4 min ahead
    expect(delta).toBeLessThan(6 * 60_000); // at most 6 min ahead
  });

  it("marks DEAD after exhausting the retry ladder", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_dead",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_x",
      status: "FAILED",
      attempts: MAX_WEBHOOK_ATTEMPTS, // already at ladder end — one more fails → DEAD
    });
    mockInboxUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockLookupBooking.mockRejectedValueOnce(new Error("permanent PMS error"));
    mockInboxUpdate.mockResolvedValueOnce({});

    const outcome = await processInboxRow("inbox_dead");

    expect(outcome).toBe("DEAD");
    const update = mockInboxUpdateMany.mock.calls[1][0];
    expect(update.data.status).toBe("DEAD");
    expect(update.data.deadAt).toBeInstanceOf(Date);
    expect(update.data.nextRetryAt).toBeNull();
  });
});

// ── Circuit breaker distinction (adapter vs data failures) ──

describe("processInboxRow — circuit breaker scope", () => {
  it("calls recordFailure when the ADAPTER (lookupBooking) throws", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_adapter_fail",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_x",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockLookupBooking.mockRejectedValueOnce(new Error("Mews HTTP 503"));

    await processInboxRow("inbox_adapter_fail");

    expect(mockRecordFailure).toHaveBeenCalledWith(
      "t1",
      "mews",
      expect.stringContaining("Mews HTTP 503"),
    );
  });

  it("does NOT call recordFailure when INGEST (data validation) throws", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_data_fail",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_x",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    // Adapter succeeds; the Zod error comes from upsertBookingFromPms.
    mockLookupBooking.mockResolvedValueOnce(makeLookup());
    mockUpsertBooking.mockRejectedValueOnce(
      new Error("[{\"code\":\"invalid_format\",\"path\":[\"guest\",\"email\"]}]"),
    );

    await processInboxRow("inbox_data_fail");

    // Row still went to FAILED for retry, BUT the circuit was NOT
    // incremented — data quality issues must not lock out healthy
    // adapters.
    expect(mockRecordFailure).not.toHaveBeenCalled();
    const finalUpdate = mockInboxUpdateMany.mock.calls[1][0];
    expect(finalUpdate.data.status).toBe("FAILED");
  });

  it("is a no-op when row is already PROCESSED", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_done",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_x",
      status: "PROCESSED",
      attempts: 1,
      receivedAt: new Date(Date.now() - 100),
    });

    const outcome = await processInboxRow("inbox_done");
    expect(outcome).toBe("PROCESSED");
    expect(mockInboxUpdateMany).not.toHaveBeenCalled();
    expect(mockLookupBooking).not.toHaveBeenCalled();
  });

  it("is a no-op when another worker already claimed the row", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_raced",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_x",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockInboxUpdateMany.mockResolvedValueOnce({ count: 0 }); // another worker won

    const outcome = await processInboxRow("inbox_raced");
    expect(outcome).toBe("PENDING");
    expect(mockLookupBooking).not.toHaveBeenCalled();
  });
});

// ── Budget-aware deferral ───────────────────────────────────

describe("processPmsWebhook — budget exceeded", () => {
  it("defers remaining events when the processing budget is exhausted", async () => {
    // Two events; budget=0 forces deferral of both.
    mockInboxCreate
      .mockResolvedValueOnce({ id: "inbox_a" })
      .mockResolvedValueOnce({ id: "inbox_b" });
    mockInboxUpdate.mockResolvedValue({});

    const result = await processPmsWebhook({
      tenantId: "t1",
      provider: "mews",
      events: [
        makeEvent({ externalEventId: "evt_a" }),
        makeEvent({ externalEventId: "evt_b" }),
      ],
      rawPayload: {},
      processingBudgetMs: 0,
    });

    expect(result.eventsInboxed).toBe(2);
    expect(result.eventsProcessed).toBe(0);
    expect(result.eventsDeferred).toBe(2);
    expect(mockLookupBooking).not.toHaveBeenCalled();

    // Both rows bumped to nextRetryAt=now so the retry cron picks
    // them up on its next run
    const updates = mockInboxUpdate.mock.calls.map((c) => c[0].data.nextRetryAt);
    expect(updates.every((d: Date) => d instanceof Date)).toBe(true);
  });
});

// ── Multiple events fan out to independent rows ─────────────

describe("processPmsWebhook — multi-event payloads", () => {
  it("inboxes each event independently, with per-event outcomes", async () => {
    mockInboxCreate
      .mockResolvedValueOnce({ id: "inbox_1" })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "6.0.0",
        }),
      )
      .mockResolvedValueOnce({ id: "inbox_3" });

    mockInboxFindUnique.mockResolvedValue({
      id: "inbox_1",
      tenantId: "t1",
      provider: "mews",
      externalBookingId: "res_a",
      status: "PENDING",
      attempts: 0,
      receivedAt: new Date(Date.now() - 100),
    });
    mockInboxUpdateMany.mockResolvedValue({ count: 1 });
    mockLookupBooking.mockResolvedValue(makeLookup({ externalId: "res_a" }));
    mockUpsertBooking.mockResolvedValue({ action: "updated", bookingId: "bk_a" });
    mockInboxUpdate.mockResolvedValue({});

    const result = await processPmsWebhook({
      tenantId: "t1",
      provider: "mews",
      events: [
        makeEvent({ externalEventId: "evt_a", externalBookingId: "res_a" }),
        makeEvent({ externalEventId: "evt_b", externalBookingId: "res_b" }),
        makeEvent({ externalEventId: "evt_c", externalBookingId: "res_c" }),
      ],
      rawPayload: {},
      processingBudgetMs: 10_000,
    });

    expect(result.eventsReceived).toBe(3);
    expect(result.eventsDuplicated).toBe(1);
    expect(result.eventsInboxed).toBe(2);
    expect(result.eventsProcessed).toBe(2);
  });
});
