import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Prisma mock ─────────────────────────────────────────────
//
// $transaction is modeled as "execute the callback with a tx object that
// forwards to the same underlying mocks as the top-level client". That
// matches the real Prisma interactive-transaction behavior: inside the
// callback you get a TransactionClient whose operations are transactional
// but otherwise identical to the non-tx client.

const mockQueryRaw = vi.fn();
const mockBookingCreate = vi.fn();
const mockBookingUpdate = vi.fn();

const tx = {
  $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  booking: {
    create: (...args: unknown[]) => mockBookingCreate(...args),
    update: (...args: unknown[]) => mockBookingUpdate(...args),
  },
};

const mock$transaction = vi.fn(
  async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
);

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) =>
      mock$transaction(fn),
  },
}));

const mockLog = vi.fn();
vi.mock("@/app/_lib/logger", () => ({ log: (...a: unknown[]) => mockLog(...a) }));

const mockSetSentry = vi.fn();
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: (...a: unknown[]) => mockSetSentry(...a),
}));

const mockLogSyncEvent = vi.fn();
vi.mock("../sync/log", () => ({
  logSyncEvent: (...a: unknown[]) => mockLogSyncEvent(...a),
}));

// ingest.ts emits analytics events (booking.created, booking.cancelled,
// etc.) inside the same transaction. The real `emitAnalyticsEvent`
// validates that the supplied tx is a Prisma TransactionClient via
// `isTransactionClient` (checks for $executeRaw + absence of
// $transaction); our minimal mock tx above doesn't pass that check,
// and the analytics pipeline has its own dedicated tests in
// app/_lib/analytics/pipeline/emitter.test.ts. Mock to a no-op here so
// this file's contract — the booking-ingest mutation sequence — stays
// focused.
//
// Tests that genuinely exercise the analytics emit path should import
// `createMockAnalyticsTransaction` from
// `app/_lib/analytics/pipeline/__tests__/mocks.ts` instead.
const mockEmitAnalyticsEvent = vi.fn().mockResolvedValue({
  event_id: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZB",
  outbox_id: "outbox_test",
});
vi.mock("@/app/_lib/analytics/pipeline/emitter", () => ({
  emitAnalyticsEvent: (...a: unknown[]) => mockEmitAnalyticsEvent(...a),
}));

// Import after mocks are registered
const { upsertBookingFromPms } = await import("./ingest");

// ── Test-data factory ───────────────────────────────────────

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant_1",
    provider: "mews" as const,
    externalId: "mews_booking_abc",
    providerUpdatedAt: new Date("2026-04-22T10:00:00Z"),
    source: "reconciliation" as const,
    guest: {
      firstName: "Anna",
      lastName: "Svensson",
      email: "anna@example.com",
      phone: "+46701234567",
      street: "Storgatan 1",
      postalCode: "12345",
      city: "Stockholm",
      country: "SE",
    },
    stay: {
      checkIn: new Date("2026-05-01T15:00:00Z"),
      checkOut: new Date("2026-05-03T11:00:00Z"),
      unit: "101",
      guestCount: 2,
    },
    status: "confirmed" as const,
    ...overrides,
  };
}

function makeExistingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk_existing_1",
    providerUpdatedAt: new Date("2026-04-22T09:00:00Z"),
    firstName: "Anna",
    lastName: "Svensson",
    guestEmail: "anna@example.com",
    phone: "+46701234567",
    street: "Storgatan 1",
    postalCode: "12345",
    city: "Stockholm",
    country: "SE",
    arrival: new Date("2026-05-01T15:00:00Z"),
    departure: new Date("2026-05-03T11:00:00Z"),
    unit: "101",
    status: "PRE_CHECKIN",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Case 1: INSERT when no row exists ───────────────────────

describe("upsertBookingFromPms — create path", () => {
  it("inserts a new booking when no row matches externalId", async () => {
    mockQueryRaw.mockResolvedValueOnce([]); // SELECT FOR UPDATE → empty
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_new_1",
      createdAt: new Date("2026-04-22T10:00:01Z"),
    });

    const result = await upsertBookingFromPms(makeInput());

    expect(result.action).toBe("created");
    expect(result.bookingId).toBe("bk_new_1");
    expect(mockBookingCreate).toHaveBeenCalledOnce();
    const createArgs = mockBookingCreate.mock.calls[0][0];
    expect(createArgs.data.externalId).toBe("mews_booking_abc");
    expect(createArgs.data.providerUpdatedAt).toEqual(
      new Date("2026-04-22T10:00:00Z"),
    );
    expect(createArgs.data.status).toBe("PRE_CHECKIN");
    // Legacy + new date fields both populated
    expect(createArgs.data.arrival).toEqual(createArgs.data.checkIn);
    expect(createArgs.data.departure).toEqual(createArgs.data.checkOut);
  });

  it("computes recoveryLagMs when providerCreatedAt is supplied", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_new_2",
      createdAt: new Date("2026-04-22T10:05:00Z"),
    });

    const result = await upsertBookingFromPms(
      makeInput({
        providerCreatedAt: new Date("2026-04-22T10:00:00Z"),
      }),
    );

    expect(result.action).toBe("created");
    expect(result.recoveryLagMs).toBe(5 * 60 * 1000); // 5 min in ms
  });

  it("emits the reliability signal log event with source=reconciliation", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_new_3",
      createdAt: new Date(),
    });

    await upsertBookingFromPms(makeInput({ source: "reconciliation" }));

    expect(mockLog).toHaveBeenCalledWith(
      "info",
      "pms.ingest.created",
      expect.objectContaining({ source: "reconciliation" }),
    );
  });

  it("maps adapter status 'cancelled' to Prisma CANCELLED", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_c_1",
      createdAt: new Date(),
    });

    await upsertBookingFromPms(makeInput({ status: "cancelled" }));

    expect(mockBookingCreate.mock.calls[0][0].data.status).toBe("CANCELLED");
  });

  it("maps adapter status 'no_show' to CANCELLED and flags noShow in audit", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_ns_1",
      createdAt: new Date(),
    });

    await upsertBookingFromPms(makeInput({ status: "no_show" }));

    expect(mockBookingCreate.mock.calls[0][0].data.status).toBe("CANCELLED");
    const auditPayload = mockLogSyncEvent.mock.calls[0][3];
    expect(auditPayload.noShow).toBe(true);
  });
});

// ── Case 2: STALE — incoming version not newer ──────────────

describe("upsertBookingFromPms — stale event rejection", () => {
  it("returns unchanged_stale when incoming providerUpdatedAt is older", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeExistingRow({
        providerUpdatedAt: new Date("2026-04-22T12:00:00Z"),
      }),
    ]);

    const result = await upsertBookingFromPms(
      makeInput({
        providerUpdatedAt: new Date("2026-04-22T10:00:00Z"),
      }),
    );

    expect(result.action).toBe("unchanged_stale");
    expect(result.bookingId).toBe("bk_existing_1");
    expect(mockBookingCreate).not.toHaveBeenCalled();
    expect(mockBookingUpdate).not.toHaveBeenCalled();
  });

  it("returns unchanged_stale when incoming equals stored version", async () => {
    const sameTs = new Date("2026-04-22T12:00:00Z");
    mockQueryRaw.mockResolvedValueOnce([
      makeExistingRow({ providerUpdatedAt: sameTs }),
    ]);

    const result = await upsertBookingFromPms(
      makeInput({ providerUpdatedAt: sameTs }),
    );

    expect(result.action).toBe("unchanged_stale");
    expect(mockBookingUpdate).not.toHaveBeenCalled();
  });

  it("does not treat stored providerUpdatedAt=null as a stale reject", async () => {
    // Legacy row written before the reliability engine existed.
    // It has no version yet, so the first write must land.
    mockQueryRaw.mockResolvedValueOnce([
      makeExistingRow({ providerUpdatedAt: null }),
    ]);
    mockBookingUpdate.mockResolvedValueOnce({});

    const result = await upsertBookingFromPms(
      makeInput({
        providerUpdatedAt: new Date("2026-04-22T10:00:00Z"),
        // force a different field so the identical-path isn't taken
        guest: { ...makeInput().guest, firstName: "Björn" },
      }),
    );

    expect(result.action).toBe("updated");
  });
});

// ── Case 3: IDENTICAL content, newer version ────────────────

describe("upsertBookingFromPms — identical content path", () => {
  it("bumps providerUpdatedAt but returns unchanged_identical when content matches", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeExistingRow()]);
    mockBookingUpdate.mockResolvedValueOnce({});

    const result = await upsertBookingFromPms(
      makeInput({
        providerUpdatedAt: new Date("2026-04-22T15:00:00Z"),
      }),
    );

    expect(result.action).toBe("unchanged_identical");
    expect(mockBookingUpdate).toHaveBeenCalledOnce();
    const args = mockBookingUpdate.mock.calls[0][0];
    // Only version + heartbeat touched — not content
    expect(Object.keys(args.data).sort()).toEqual(
      ["lastSyncedAt", "providerUpdatedAt"].sort(),
    );
    expect(args.data.providerUpdatedAt).toEqual(
      new Date("2026-04-22T15:00:00Z"),
    );
  });
});

// ── Case 4: UPDATE when content differs ─────────────────────

describe("upsertBookingFromPms — update path", () => {
  it("updates when incoming version is newer and content differs", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeExistingRow()]);
    mockBookingUpdate.mockResolvedValueOnce({});

    const result = await upsertBookingFromPms(
      makeInput({
        providerUpdatedAt: new Date("2026-04-22T15:00:00Z"),
        guest: { ...makeInput().guest, firstName: "Berit" },
      }),
    );

    expect(result.action).toBe("updated");
    const args = mockBookingUpdate.mock.calls[0][0];
    expect(args.data.firstName).toBe("Berit");
    expect(args.data.providerUpdatedAt).toEqual(
      new Date("2026-04-22T15:00:00Z"),
    );
  });

  it("transitions status to CANCELLED and emits booking.cancelled audit", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeExistingRow()]);
    mockBookingUpdate.mockResolvedValueOnce({});

    await upsertBookingFromPms(
      makeInput({
        providerUpdatedAt: new Date("2026-04-22T15:00:00Z"),
        status: "cancelled",
      }),
    );

    expect(mockLogSyncEvent).toHaveBeenCalledWith(
      "tenant_1",
      "mews",
      "booking.cancelled",
      expect.any(Object),
      "mews_booking_abc",
    );
  });
});

// ── Case 5: Retry on transient errors ───────────────────────

describe("upsertBookingFromPms — retry policy", () => {
  it("retries on P2002 (unique-constraint race) and succeeds on second attempt", async () => {
    const raceError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.0.0" },
    );

    // Attempt 1: empty row → INSERT → P2002 (another writer won the race)
    // Attempt 2: row now exists → UPDATE path, content differs
    mockQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeExistingRow()]);
    mockBookingCreate.mockRejectedValueOnce(raceError);
    mockBookingUpdate.mockResolvedValueOnce({});

    const result = await upsertBookingFromPms(
      makeInput({
        providerUpdatedAt: new Date("2026-04-22T15:00:00Z"),
        guest: { ...makeInput().guest, firstName: "Cecilia" },
      }),
    );

    expect(result.action).toBe("updated");
    expect(mock$transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-retryable errors (e.g., generic Error)", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("boom"));

    await expect(upsertBookingFromPms(makeInput())).rejects.toThrow("boom");
    expect(mock$transaction).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_ATTEMPTS on persistent retryable errors", async () => {
    const serErr = new Prisma.PrismaClientKnownRequestError(
      "Serialization failure",
      { code: "P2034", clientVersion: "6.0.0" },
    );
    mockQueryRaw.mockRejectedValue(serErr);

    await expect(upsertBookingFromPms(makeInput())).rejects.toMatchObject({
      code: "P2034",
    });
    expect(mock$transaction).toHaveBeenCalledTimes(3);
  }, 10_000);
});

// ── Case 6: Input validation ────────────────────────────────

describe("upsertBookingFromPms — input validation", () => {
  it("rejects malformed email before touching the DB", async () => {
    await expect(
      upsertBookingFromPms(
        makeInput({ guest: { ...makeInput().guest, email: "not-an-email" } }),
      ),
    ).rejects.toThrow();
    expect(mock$transaction).not.toHaveBeenCalled();
  });

  it("rejects empty externalId", async () => {
    await expect(
      upsertBookingFromPms(makeInput({ externalId: "" })),
    ).rejects.toThrow();
    expect(mock$transaction).not.toHaveBeenCalled();
  });

  it("rejects unknown provider", async () => {
    await expect(
      upsertBookingFromPms(makeInput({ provider: "bogus" })),
    ).rejects.toThrow();
    expect(mock$transaction).not.toHaveBeenCalled();
  });
});

// ── Case 7: Observability wiring ────────────────────────────

describe("upsertBookingFromPms — observability", () => {
  it("sets Sentry tenant context before DB work", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_x",
      createdAt: new Date(),
    });

    await upsertBookingFromPms(makeInput());

    expect(mockSetSentry).toHaveBeenCalledWith("tenant_1");
    // Must have been called before any DB interaction
    const sentryOrder = mockSetSentry.mock.invocationCallOrder[0];
    const txOrder = mock$transaction.mock.invocationCallOrder[0];
    expect(sentryOrder).toBeLessThan(txOrder);
  });

  it("swallows audit failures without affecting the result", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockBookingCreate.mockResolvedValueOnce({
      id: "bk_a",
      createdAt: new Date(),
    });
    mockLogSyncEvent.mockRejectedValueOnce(new Error("audit down"));

    const result = await upsertBookingFromPms(makeInput());

    expect(result.action).toBe("created");
    expect(mockLog).toHaveBeenCalledWith(
      "warn",
      "pms.ingest.audit_failed",
      expect.any(Object),
    );
  });
});
