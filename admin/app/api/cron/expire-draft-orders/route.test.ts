import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Env stub ─────────────────────────────────────────────────────

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));

// ── Service mock ────────────────────────────────────────────────

const mockSweep = vi.fn();
vi.mock("@/app/_lib/draft-orders/expire", () => ({
  sweepExpiredDrafts: (...args: unknown[]) => mockSweep(...args),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { GET } = await import("./route");

// ── Helpers ─────────────────────────────────────────────────────

function makeReq(auth?: string): Request {
  return new Request("http://test/api/cron/expire-draft-orders", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });
}

function happySweep(overrides: Record<string, unknown> = {}) {
  return {
    examined: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
    holdReleaseErrors: 0,
    errorBreakdown: {
      raceOnTerminal: 0,
      transitionErrors: 0,
      holdReleaseErrors: 0,
      stripeErrors: 0,
    },
    durationMs: 12,
    partial: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSweep.mockResolvedValue(happySweep());
});

// ═══════════════════════════════════════════════════════════════
// R1 — missing Authorization → 401
// ═══════════════════════════════════════════════════════════════

describe("expire-draft-orders cron — R1 missing auth", () => {
  it("returns 401 without invoking the service", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// R2 — wrong Bearer → 401
// ═══════════════════════════════════════════════════════════════

describe("expire-draft-orders cron — R2 wrong bearer", () => {
  it("returns 401 on non-matching token", async () => {
    const res = await GET(makeReq("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// R3 — correct Bearer → 200 + full SweepResult shape
// ═══════════════════════════════════════════════════════════════

describe("expire-draft-orders cron — R3 happy", () => {
  it("returns 200 with ok:true and every SweepResult field", async () => {
    mockSweep.mockResolvedValue(
      happySweep({
        examined: 5,
        cancelled: 4,
        skipped: 1,
        failed: 0,
        holdReleaseErrors: 2,
        errorBreakdown: {
          raceOnTerminal: 1,
          transitionErrors: 0,
          holdReleaseErrors: 2,
          stripeErrors: 0,
        },
        durationMs: 312,
        partial: false,
      }),
    );

    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.examined).toBe(5);
    expect(body.cancelled).toBe(4);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.holdReleaseErrors).toBe(2);
    expect(body.partial).toBe(false);
    expect(body.durationMs).toBe(312);
    expect(body.errorBreakdown).toEqual({
      raceOnTerminal: 1,
      transitionErrors: 0,
      holdReleaseErrors: 2,
      stripeErrors: 0,
    });

    // Service was invoked with a deadline derived from the wall budget.
    expect(mockSweep).toHaveBeenCalledTimes(1);
    const opts = mockSweep.mock.calls[0][0] as { deadline: number };
    expect(typeof opts.deadline).toBe("number");
    expect(opts.deadline).toBeGreaterThan(Date.now());
  });
});

// ═══════════════════════════════════════════════════════════════
// R4 — partial=true propagation
// ═══════════════════════════════════════════════════════════════

describe("expire-draft-orders cron — R4 partial propagation", () => {
  it("surfaces partial:true from the service", async () => {
    mockSweep.mockResolvedValue(
      happySweep({ examined: 200, cancelled: 50, partial: true }),
    );

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.cancelled).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// R5 — service throws → 500 ok:false (defense-in-depth)
// ═══════════════════════════════════════════════════════════════

describe("expire-draft-orders cron — R5 service throws", () => {
  it("returns 500 with ok:false on unexpected service error", async () => {
    mockSweep.mockRejectedValue(new Error("prisma boom"));

    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});
