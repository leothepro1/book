import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockInboxFindMany = vi.fn();
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    pmsWebhookInbox: {
      findMany: (...a: unknown[]) => mockInboxFindMany(...a),
    },
  },
}));

const mockProcessInboxRow = vi.fn();
vi.mock("@/app/_lib/integrations/reliability/webhook", () => ({
  processInboxRow: (...a: unknown[]) => mockProcessInboxRow(...a),
  // The route imports this constant to compute the reclaim cutoff
  // for stranded PROCESSING rows. The actual value is irrelevant to
  // the test since we control what findMany returns.
  PROCESSING_RECLAIM_AFTER_MS: 5 * 60_000,
}));

const { GET } = await import("./route");

function makeReq(auth?: string) {
  return new Request("https://example.com/api/cron/retry-pms-webhooks", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cron/retry-pms-webhooks", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 for a wrong cron secret", async () => {
    const res = await GET(makeReq("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with zero counters when no rows are due", async () => {
    mockInboxFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batchSize).toBe(0);
    expect(body.processed).toBe(0);
  });

  it("aggregates counters by processInboxRow outcome", async () => {
    mockInboxFindMany.mockResolvedValueOnce([
      { id: "i1", tenantId: "t1", provider: "mews", status: "PENDING" },
      { id: "i2", tenantId: "t2", provider: "mews", status: "PENDING" },
      { id: "i3", tenantId: "t1", provider: "fake", status: "PENDING" },
      { id: "i4", tenantId: "t3", provider: "mews", status: "PENDING" },
    ]);
    mockProcessInboxRow
      .mockResolvedValueOnce("PROCESSED")
      .mockResolvedValueOnce("FAILED")
      .mockResolvedValueOnce("DEAD")
      .mockResolvedValueOnce("PROCESSED");

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.retried).toBe(1);
    expect(body.dead).toBe(1);
    expect(body.errors).toBe(0);
  });

  it("reports reclaimed count when PROCESSING rows are included in the batch", async () => {
    // Stranded PROCESSING row (original worker crashed) + one fresh
    // PENDING row. Both should be processed; reclaim count = 1.
    mockInboxFindMany.mockResolvedValueOnce([
      { id: "stranded_1", tenantId: "t1", provider: "mews", status: "PROCESSING" },
      { id: "fresh_1", tenantId: "t2", provider: "mews", status: "PENDING" },
    ]);
    mockProcessInboxRow
      .mockResolvedValueOnce("PROCESSED")
      .mockResolvedValueOnce("PROCESSED");

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();
    expect(body.reclaimed).toBe(1);
    expect(body.processed).toBe(2);
  });

  it("counts uncaught throws as errors without aborting the batch", async () => {
    mockInboxFindMany.mockResolvedValueOnce([
      { id: "i1", tenantId: "t1", provider: "mews", status: "PENDING" },
      { id: "i2", tenantId: "t2", provider: "mews", status: "PENDING" },
    ]);
    mockProcessInboxRow
      .mockRejectedValueOnce(new Error("unexpected"))
      .mockResolvedValueOnce("PROCESSED");

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();
    expect(body.errors).toBe(1);
    expect(body.processed).toBe(1);
  });
});
