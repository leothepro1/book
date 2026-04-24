import { describe, it, expect, vi, beforeEach } from "vitest";

const hitFindMany = vi.fn();
const redirectUpdate = vi.fn();
const hitDeleteMany = vi.fn();
const mockLog = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    seoRedirectHit: {
      findMany: (...a: unknown[]) => hitFindMany(...a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        seoRedirect: { update: (...a: unknown[]) => redirectUpdate(...a) },
        seoRedirectHit: {
          deleteMany: (...a: unknown[]) => hitDeleteMany(...a),
        },
      }),
  },
}));

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));

vi.mock("@/app/_lib/logger", () => ({
  log: (...a: unknown[]) => mockLog(...a),
}));

const { GET } = await import("./route");

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/aggregate-seo-redirect-hits", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cron/aggregate-seo-redirect-hits", () => {
  it("401s on missing/bad bearer", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(hitFindMany).not.toHaveBeenCalled();
  });

  it("returns processed: 0 on empty table", async () => {
    hitFindMany.mockResolvedValue([]);

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as {
      ok: boolean;
      processed: number;
      redirectsUpdated: number;
    };

    expect(body).toEqual({ ok: true, processed: 0, redirectsUpdated: 0 });
    expect(redirectUpdate).not.toHaveBeenCalled();
    expect(hitDeleteMany).not.toHaveBeenCalled();
  });

  it("groups hits by redirectId and increments hitCount per group", async () => {
    const t0 = new Date("2026-04-24T10:00:00Z");
    const t1 = new Date("2026-04-24T10:05:00Z");
    const t2 = new Date("2026-04-24T10:10:00Z");

    hitFindMany.mockResolvedValue([
      { id: "h1", redirectId: "rdr_A", occurredAt: t0 },
      { id: "h2", redirectId: "rdr_A", occurredAt: t1 },
      { id: "h3", redirectId: "rdr_B", occurredAt: t2 },
    ]);
    redirectUpdate.mockResolvedValue({});
    hitDeleteMany.mockResolvedValue({ count: 3 });

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as {
      processed: number;
      redirectsUpdated: number;
    };

    expect(body.processed).toBe(3);
    expect(body.redirectsUpdated).toBe(2);
    expect(redirectUpdate).toHaveBeenCalledTimes(2);

    const updateCalls = redirectUpdate.mock.calls.map(
      (c) =>
        c[0] as {
          where: { id: string };
          data: { hitCount: { increment: number }; lastHitAt: Date };
        },
    );
    const byId = new Map(updateCalls.map((c) => [c.where.id, c.data]));
    expect(byId.get("rdr_A")?.hitCount).toEqual({ increment: 2 });
    expect(byId.get("rdr_B")?.hitCount).toEqual({ increment: 1 });
  });

  it("sets lastHitAt to the LATEST occurredAt per redirect", async () => {
    const tEarly = new Date("2026-04-24T08:00:00Z");
    const tLate = new Date("2026-04-24T12:00:00Z");
    const tMid = new Date("2026-04-24T10:00:00Z");

    hitFindMany.mockResolvedValue([
      // Out-of-order within the same group — later rows can
      // arrive first if findMany's orderBy fluctuates; the
      // aggregator must still pick the max timestamp.
      { id: "h1", redirectId: "rdr_A", occurredAt: tLate },
      { id: "h2", redirectId: "rdr_A", occurredAt: tEarly },
      { id: "h3", redirectId: "rdr_A", occurredAt: tMid },
    ]);
    redirectUpdate.mockResolvedValue({});
    hitDeleteMany.mockResolvedValue({ count: 3 });

    await GET(req("Bearer test-secret"));

    const call = redirectUpdate.mock.calls[0][0] as {
      data: { lastHitAt: Date };
    };
    expect(call.data.lastHitAt).toEqual(tLate);
  });

  it("deletes exactly the drained hit rows (by id list)", async () => {
    hitFindMany.mockResolvedValue([
      { id: "h1", redirectId: "rdr_A", occurredAt: new Date() },
      { id: "h2", redirectId: "rdr_A", occurredAt: new Date() },
      { id: "h3", redirectId: "rdr_B", occurredAt: new Date() },
    ]);
    redirectUpdate.mockResolvedValue({});
    hitDeleteMany.mockResolvedValue({ count: 3 });

    await GET(req("Bearer test-secret"));

    expect(hitDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["h1", "h2", "h3"] } },
    });
  });

  it("batches up to 1000 rows with asc ordering by occurredAt", async () => {
    hitFindMany.mockResolvedValue([]);
    await GET(req("Bearer test-secret"));

    expect(hitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
        orderBy: { occurredAt: "asc" },
      }),
    );
  });

  it("returns 500 on DB failure", async () => {
    hitFindMany.mockRejectedValue(new Error("DB down"));

    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(500);
    expect(mockLog).toHaveBeenCalledWith(
      "error",
      "seo.redirect.hits.aggregation_failed",
      expect.objectContaining({ error: "DB down" }),
    );
  });

  it("logs structured completion event with counts", async () => {
    hitFindMany.mockResolvedValue([
      { id: "h1", redirectId: "rdr_A", occurredAt: new Date() },
    ]);
    redirectUpdate.mockResolvedValue({});
    hitDeleteMany.mockResolvedValue({ count: 1 });

    await GET(req("Bearer test-secret"));

    expect(mockLog).toHaveBeenCalledWith(
      "info",
      "seo.redirect.hits.aggregated",
      { processed: 1, redirectsUpdated: 1 },
    );
  });
});
