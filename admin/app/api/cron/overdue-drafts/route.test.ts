import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Env stub ─────────────────────────────────────────────────────

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));

// ── Service mock ────────────────────────────────────────────────

const mockMark = vi.fn();
vi.mock("@/app/_lib/draft-orders/overdue", () => ({
  markOverdueDrafts: (...args: unknown[]) => mockMark(...args),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { GET } = await import("./route");

// ── Helpers ─────────────────────────────────────────────────────

function makeReq(auth?: string): Request {
  return new Request("http://test/api/cron/overdue-drafts", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });
}

function happyResult(overrides: Record<string, unknown> = {}) {
  return {
    examined: 0,
    marked: 0,
    skipped: 0,
    failed: 0,
    durationMs: 9,
    partial: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockMark.mockResolvedValue(happyResult());
});

// ═══════════════════════════════════════════════════════════════
// R1 — missing Authorization → 401
// ═══════════════════════════════════════════════════════════════

describe("overdue-drafts cron — R1 missing auth", () => {
  it("returns 401 without invoking the service", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockMark).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// R2 — wrong Bearer → 401
// ═══════════════════════════════════════════════════════════════

describe("overdue-drafts cron — R2 wrong bearer", () => {
  it("returns 401 on non-matching token", async () => {
    const res = await GET(makeReq("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockMark).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// R3 — correct Bearer → 200 + full OverdueResult shape
// ═══════════════════════════════════════════════════════════════

describe("overdue-drafts cron — R3 happy", () => {
  it("returns 200 with ok:true and every OverdueResult field", async () => {
    mockMark.mockResolvedValue(
      happyResult({
        examined: 7,
        marked: 5,
        skipped: 1,
        failed: 1,
        durationMs: 412,
        partial: false,
      }),
    );

    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.examined).toBe(7);
    expect(body.marked).toBe(5);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.partial).toBe(false);
    expect(body.durationMs).toBe(412);

    // Service was invoked with a deadline derived from the wall budget.
    expect(mockMark).toHaveBeenCalledTimes(1);
    const opts = mockMark.mock.calls[0][0] as { deadline: number };
    expect(typeof opts.deadline).toBe("number");
    expect(opts.deadline).toBeGreaterThan(Date.now());
  });
});

// ═══════════════════════════════════════════════════════════════
// R4 — service throws → 500 ok:false (defense-in-depth)
// ═══════════════════════════════════════════════════════════════

describe("overdue-drafts cron — R4 service throws", () => {
  it("returns 500 with ok:false on unexpected service error", async () => {
    mockMark.mockRejectedValue(new Error("prisma boom"));

    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});
