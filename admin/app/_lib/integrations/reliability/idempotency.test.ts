import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Prisma mock ─────────────────────────────────────────────

const mockKeyCreate = vi.fn();
const mockKeyFindUnique = vi.fn();
const mockKeyUpdate = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    pmsIdempotencyKey: {
      create: (...a: unknown[]) => mockKeyCreate(...a),
      findUnique: (...a: unknown[]) => mockKeyFindUnique(...a),
      update: (...a: unknown[]) => mockKeyUpdate(...a),
    },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { computeIdempotencyKey, withIdempotency } = await import(
  "./idempotency"
);

beforeEach(() => {
  vi.clearAllMocks();
  mockKeyUpdate.mockResolvedValue({});
});

// ── computeIdempotencyKey ──────────────────────────────────

describe("computeIdempotencyKey", () => {
  it("produces deterministic SHA-256 for identical inputs", () => {
    const a = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "createBooking",
      inputs: { orderId: "o1", guests: 2, dates: ["2026-05-01", "2026-05-03"] },
    });
    const b = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "createBooking",
      inputs: { dates: ["2026-05-01", "2026-05-03"], orderId: "o1", guests: 2 },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when tenantId changes", () => {
    const a = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "createBooking",
      inputs: { orderId: "o1" },
    });
    const b = computeIdempotencyKey({
      tenantId: "t2",
      provider: "mews",
      operation: "createBooking",
      inputs: { orderId: "o1" },
    });
    expect(a).not.toBe(b);
  });

  it("differs when operation changes", () => {
    const a = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "createBooking",
      inputs: { orderId: "o1" },
    });
    const b = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "holdAvailability",
      inputs: { orderId: "o1" },
    });
    expect(a).not.toBe(b);
  });

  it("handles Date inputs deterministically", () => {
    const d = new Date("2026-05-01T10:00:00Z");
    const a = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "op",
      inputs: { at: d },
    });
    const b = computeIdempotencyKey({
      tenantId: "t1",
      provider: "mews",
      operation: "op",
      inputs: { at: new Date("2026-05-01T10:00:00Z") },
    });
    expect(a).toBe(b);
  });
});

// ── withIdempotency ──────────────────────────────────────────

describe("withIdempotency — first caller", () => {
  it("runs fn, stores COMPLETED with result, returns result", async () => {
    mockKeyCreate.mockResolvedValueOnce({ id: "row_1" });
    const fn = vi.fn(async () => ({ ok: true, ref: "mews-123" }));

    const result = await withIdempotency(
      "key-abc",
      { tenantId: "t1", provider: "mews", operation: "createBooking" },
      fn,
    );

    expect(result).toEqual({ ok: true, ref: "mews-123" });
    expect(fn).toHaveBeenCalledOnce();

    const update = mockKeyUpdate.mock.calls[0][0];
    expect(update.data.status).toBe("COMPLETED");
    expect(update.data.resultJson).toEqual({ ok: true, ref: "mews-123" });
    expect(update.data.completedAt).toBeInstanceOf(Date);
  });

  it("stores FAILED with error when fn throws", async () => {
    mockKeyCreate.mockResolvedValueOnce({ id: "row_2" });
    const fn = vi.fn(async () => {
      throw new Error("Mews 503");
    });

    await expect(
      withIdempotency(
        "key-fail",
        { tenantId: "t1", provider: "mews", operation: "createBooking" },
        fn,
      ),
    ).rejects.toThrow("Mews 503");

    const update = mockKeyUpdate.mock.calls[0][0];
    expect(update.data.status).toBe("FAILED");
    expect(update.data.resultJson).toEqual({ error: "Mews 503" });
  });

  it("serializes Date values as __date markers", async () => {
    mockKeyCreate.mockResolvedValueOnce({ id: "row_date" });
    const date = new Date("2026-05-01T10:00:00Z");
    const fn = vi.fn(async () => ({ expiresAt: date }));

    await withIdempotency(
      "key-date",
      { tenantId: "t1", provider: "mews", operation: "holdAvailability" },
      fn,
    );

    const update = mockKeyUpdate.mock.calls[0][0];
    expect(update.data.resultJson.expiresAt).toEqual({
      __date: "2026-05-01T10:00:00.000Z",
    });
  });
});

// ── withIdempotency — follower (key collision) ─────────────

describe("withIdempotency — follower returns cached result", () => {
  it("returns the cached COMPLETED result without re-running fn", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "unique constraint",
      { code: "P2002", clientVersion: "6.0.0" },
    );
    mockKeyCreate.mockRejectedValueOnce(p2002);
    mockKeyFindUnique.mockResolvedValueOnce({
      id: "row_done",
      status: "COMPLETED",
      resultJson: { ok: true, ref: "mews-cached" },
    });

    const fn = vi.fn(async () => ({ ok: true, ref: "should-not-run" }));

    const result = await withIdempotency(
      "key-follower",
      { tenantId: "t1", provider: "mews", operation: "createBooking" },
      fn,
    );

    expect(result).toEqual({ ok: true, ref: "mews-cached" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws the cached error for a FAILED key", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "unique constraint",
      { code: "P2002", clientVersion: "6.0.0" },
    );
    mockKeyCreate.mockRejectedValueOnce(p2002);
    mockKeyFindUnique.mockResolvedValueOnce({
      id: "row_failed",
      status: "FAILED",
      resultJson: { error: "PMS rejected" },
    });

    const fn = vi.fn();
    await expect(
      withIdempotency(
        "key-cached-fail",
        { tenantId: "t1", provider: "mews", operation: "createBooking" },
        fn,
      ),
    ).rejects.toThrow(/PMS rejected/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("polls and returns once IN_FLIGHT transitions to COMPLETED", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "unique constraint",
      { code: "P2002", clientVersion: "6.0.0" },
    );
    mockKeyCreate.mockRejectedValueOnce(p2002);
    // First poll: still IN_FLIGHT. Second: COMPLETED.
    mockKeyFindUnique
      .mockResolvedValueOnce({
        id: "row_inflight",
        status: "IN_FLIGHT",
        resultJson: null,
      })
      .mockResolvedValueOnce({
        id: "row_inflight",
        status: "COMPLETED",
        resultJson: { ok: true },
      });

    const fn = vi.fn();
    const result = await withIdempotency(
      "key-poll",
      { tenantId: "t1", provider: "mews", operation: "createBooking" },
      fn,
      // test-only short poll to avoid 30-s default
    );

    expect(result).toEqual({ ok: true });
    expect(fn).not.toHaveBeenCalled();
    expect(mockKeyFindUnique).toHaveBeenCalledTimes(2);
  }, 5_000);

  it("rethrows non-P2002 DB errors during claim", async () => {
    mockKeyCreate.mockRejectedValueOnce(new Error("DB down"));
    const fn = vi.fn();

    await expect(
      withIdempotency(
        "key-db-fail",
        { tenantId: "t1", provider: "mews", operation: "createBooking" },
        fn,
      ),
    ).rejects.toThrow("DB down");
  });
});
