/**
 * End-to-end integration test for the PMS reliability engine.
 *
 * Exercises the real module composition: webhook intake → real
 * FakeAdapter.lookupBooking → real upsertBookingFromPms → prisma
 * transaction. Only prisma itself is mocked (the wire format of DB
 * calls is asserted), everything above it runs for real.
 *
 * This is the "do the pieces actually connect" test — it catches
 * wiring regressions that per-module unit tests (with mocked
 * dependencies) would miss.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Prisma mock (the only boundary we mock) ─────────────────
//
// Every call the real code makes against prisma lands in these
// vi.fn() slots; the test controls what they return.

const mockInboxCreate = vi.fn();
const mockInboxFindUnique = vi.fn();
const mockInboxUpdate = vi.fn();
const mockInboxUpdateMany = vi.fn();

const mockBookingQueryRaw = vi.fn();
const mockBookingCreate = vi.fn();
const mockBookingUpdate = vi.fn();

const mockSyncEventCreate = vi.fn();

// $transaction forwards the callback with a tx proxy that routes to
// the same underlying mocks — mirrors Prisma's interactive-transaction
// behaviour.
const mock$transaction = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      $queryRaw: (...a: unknown[]) => mockBookingQueryRaw(...a),
      booking: {
        create: (...a: unknown[]) => mockBookingCreate(...a),
        update: (...a: unknown[]) => mockBookingUpdate(...a),
      },
    };
    return fn(tx);
  },
);

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    pmsWebhookInbox: {
      create: (...a: unknown[]) => mockInboxCreate(...a),
      findUnique: (...a: unknown[]) => mockInboxFindUnique(...a),
      update: (...a: unknown[]) => mockInboxUpdate(...a),
      updateMany: (...a: unknown[]) => mockInboxUpdateMany(...a),
    },
    booking: {
      create: (...a: unknown[]) => mockBookingCreate(...a),
      update: (...a: unknown[]) => mockBookingUpdate(...a),
    },
    syncEvent: {
      create: (...a: unknown[]) => mockSyncEventCreate(...a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mock$transaction(fn),
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

// The FakeAdapter file imports from a cancellations package that the
// reliability engine has no dependency on. Stub it to keep the e2e
// test boundary clean.
vi.mock("@/app/_lib/cancellations/errors", () => ({
  TransientPmsError: class extends Error {},
  PermanentPmsError: class extends Error {},
}));

// Circuit breaker is called from webhook path on success/failure.
vi.mock("../sync/circuit-breaker", () => ({
  recordSuccess: vi.fn(async () => {}),
  recordFailure: vi.fn(async () => {}),
}));

// ── resolveAdapter → return a REAL FakeAdapter ──────────────

import { FakeAdapter } from "../adapters/fake";

const fakeAdapter = new FakeAdapter({ scenario: "happy", delayMs: 0 });

vi.mock("../resolve", () => ({
  resolveAdapter: vi.fn(async () => fakeAdapter),
}));

// Import under test
const { processPmsWebhook } = await import("./webhook");

// ── Setup ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default inbox row returned after create
  mockInboxCreate.mockImplementation(async ({ data }) => ({
    id: `inbox_${data.externalEventId}`,
  }));

  // When processInboxRow reads the row back, return a minimal shape
  mockInboxFindUnique.mockImplementation(async ({ where }) => ({
    id: where.id,
    tenantId: "tenant_1",
    provider: "fake",
    externalBookingId: "res_e2e_001",
    status: "PENDING",
    attempts: 0,
    receivedAt: new Date(Date.now() - 100),
  }));

  // Claim + status transitions
  mockInboxUpdateMany.mockResolvedValue({ count: 1 });
  mockInboxUpdate.mockResolvedValue({});
  mockSyncEventCreate.mockResolvedValue({});

  // No existing booking row (→ ingest takes INSERT path)
  mockBookingQueryRaw.mockResolvedValue([]);
  mockBookingCreate.mockImplementation(async ({ data }) => ({
    id: "bk_new_001",
    createdAt: new Date(),
    ...data,
  }));
});

// ── The test ────────────────────────────────────────────────

describe("PMS reliability — end-to-end webhook → booking pipeline", () => {
  it("a fresh webhook creates an inbox row, fetches from PMS, inserts the booking, and audits", async () => {
    const result = await processPmsWebhook({
      tenantId: "tenant_1",
      provider: "fake",
      events: [
        {
          externalEventId: "evt_real_001",
          externalBookingId: "res_e2e_001",
          eventType: "Reservation",
        },
      ],
      rawPayload: { Events: [{ Discriminator: "Reservation" }] },
      processingBudgetMs: 10_000,
    });

    // ── Webhook intake — exactly one event moved end-to-end ──
    expect(result.eventsReceived).toBe(1);
    expect(result.eventsInboxed).toBe(1);
    expect(result.eventsProcessed).toBe(1);
    expect(result.eventsDeferred).toBe(0);
    expect(result.eventsDuplicated).toBe(0);

    // ── Inbox persisted with the right dedup key ──
    expect(mockInboxCreate).toHaveBeenCalledOnce();
    const inboxArgs = mockInboxCreate.mock.calls[0][0];
    expect(inboxArgs.data.externalEventId).toBe("evt_real_001");
    expect(inboxArgs.data.externalBookingId).toBe("res_e2e_001");
    expect(inboxArgs.data.provider).toBe("fake");
    expect(inboxArgs.data.status).toBe("PENDING");

    // ── Ingest chokepoint wrote a new Booking row ──
    expect(mockBookingCreate).toHaveBeenCalledOnce();
    const bookingArgs = mockBookingCreate.mock.calls[0][0];
    // Guest email from the FakeAdapter's lookupBooking default
    expect(bookingArgs.data.guestEmail).toBe("sofia.bergstrom@example.com");
    // Source is preserved all the way through
    expect(bookingArgs.data.externalSource).toBe("fake");
    // providerUpdatedAt flows from the adapter's lookup result
    expect(bookingArgs.data.providerUpdatedAt).toBeInstanceOf(Date);
    // Legacy arrival/departure + new checkIn/checkOut both populated
    expect(bookingArgs.data.arrival).toEqual(bookingArgs.data.checkIn);
    expect(bookingArgs.data.departure).toEqual(bookingArgs.data.checkOut);

    // ── Audit trail written ──
    // SyncEvent for the booking.created from ingest, AND a sync.completed
    // from the webhook handler. Both must be non-throwing.
    expect(mockSyncEventCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
    const eventTypes = mockSyncEventCreate.mock.calls.map(
      (c) => c[0].data.eventType,
    );
    expect(eventTypes).toContain("booking.created");
    expect(eventTypes).toContain("sync.completed");

    // ── Inbox marked PROCESSED terminally via CAS updateMany ──
    const finalInboxUpdate = mockInboxUpdateMany.mock.calls.find(
      (c) => c[0].data.status === "PROCESSED",
    );
    expect(finalInboxUpdate).toBeDefined();
    expect(finalInboxUpdate![0].data.processedAt).toBeInstanceOf(Date);
  });

  it("a re-delivery of the same event is deflected by the inbox unique constraint (no second booking)", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.0.0" },
    );
    mockInboxCreate.mockRejectedValueOnce(p2002);

    const result = await processPmsWebhook({
      tenantId: "tenant_1",
      provider: "fake",
      events: [
        {
          externalEventId: "evt_replay_999",
          externalBookingId: "res_e2e_001",
          eventType: "Reservation",
        },
      ],
      rawPayload: {},
      processingBudgetMs: 10_000,
    });

    expect(result.eventsDuplicated).toBe(1);
    expect(result.eventsInboxed).toBe(0);
    expect(result.eventsProcessed).toBe(0);
    // Critical: ingest chokepoint was not touched. PMS retry storms
    // never translate into duplicate Booking rows.
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("a stale webhook (providerUpdatedAt <= stored) is no-op via ingest", async () => {
    // Existing booking row with a LATER providerUpdatedAt than what
    // FakeAdapter's lookupBooking returns — the ingest chokepoint
    // must classify this as unchanged_stale.
    const farFuture = new Date("2099-01-01T00:00:00Z");
    mockBookingQueryRaw.mockResolvedValueOnce([
      {
        id: "bk_existing_999",
        providerUpdatedAt: farFuture,
        firstName: "Anna",
        lastName: "Old",
        guestEmail: "old@example.com",
        phone: null,
        street: null,
        postalCode: null,
        city: null,
        country: null,
        arrival: new Date("2025-01-01"),
        departure: new Date("2025-01-02"),
        unit: "X",
        status: "PRE_CHECKIN",
      },
    ]);

    const result = await processPmsWebhook({
      tenantId: "tenant_1",
      provider: "fake",
      events: [
        {
          externalEventId: "evt_stale_001",
          externalBookingId: "res_e2e_stale",
          eventType: "Reservation",
        },
      ],
      rawPayload: {},
      processingBudgetMs: 10_000,
    });

    expect(result.eventsProcessed).toBe(1);
    // No INSERT. The row was locked, its stored version was newer,
    // the ingest classified the webhook as stale and returned a no-op.
    expect(mockBookingCreate).not.toHaveBeenCalled();
    expect(mockBookingUpdate).not.toHaveBeenCalled();
  });
});
