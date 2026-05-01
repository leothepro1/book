import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/integrations/sync/circuit-breaker", () => ({
  FAILURE_THRESHOLD: 5,
}));

// Prisma surface — every aggregate the endpoint fires in parallel.
const mockInboxGroupBy = vi.fn();
const mockInboxFindFirst = vi.fn();
const mockInboxCount = vi.fn();
const mockOutboundGroupBy = vi.fn();
const mockOutboundFindFirst = vi.fn();
const mockOutboundCount = vi.fn();
const mockIdempotencyGroupBy = vi.fn();
const mockCursorCount = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingGroupBy = vi.fn();
const mockIntegrationCount = vi.fn();
const mockInboxGroupByTenant = vi.fn();
const mockOutboundGroupByTenant = vi.fn();
const mockSyncEventFindMany = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    pmsWebhookInbox: {
      groupBy: (...a: unknown[]) => {
        const args = a[0] as { by?: string[]; where?: unknown };
        if (args.by?.[0] === "tenantId") return mockInboxGroupByTenant(args);
        return mockInboxGroupBy(args);
      },
      findFirst: (...a: unknown[]) => mockInboxFindFirst(...a),
      count: (...a: unknown[]) => mockInboxCount(...a),
    },
    pmsOutboundJob: {
      groupBy: (...a: unknown[]) => {
        const args = a[0] as { by?: string[]; where?: unknown };
        if (args.by?.[0] === "tenantId") return mockOutboundGroupByTenant(args);
        return mockOutboundGroupBy(args);
      },
      findFirst: (...a: unknown[]) => mockOutboundFindFirst(...a),
      count: (...a: unknown[]) => mockOutboundCount(...a),
    },
    pmsIdempotencyKey: {
      groupBy: (...a: unknown[]) => mockIdempotencyGroupBy(...a),
    },
    reconciliationCursor: {
      count: (...a: unknown[]) => mockCursorCount(...a),
    },
    booking: {
      count: (...a: unknown[]) => mockBookingCount(...a),
      // route.ts:164 — groupBy({ by: ["tenantId"], where: {
      // integrityFlag: { not: null } } }) returns one row per
      // tenant with at least one integrity-flagged booking. The
      // route then takes `.length` to count tenants. Default
      // [] keeps the count at 0 unless a test overrides.
      groupBy: (...a: unknown[]) => mockBookingGroupBy(...a),
    },
    tenantIntegration: {
      count: (...a: unknown[]) => mockIntegrationCount(...a),
    },
    syncEvent: {
      findMany: (...a: unknown[]) => mockSyncEventFindMany(...a),
    },
  },
}));

const { GET } = await import("./route");

function makeReq(auth?: string) {
  return new Request(
    "https://example.com/api/admin/pms-reliability/health",
    { headers: auth ? { authorization: auth } : {} },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInboxGroupBy.mockResolvedValue([]);
  mockOutboundGroupBy.mockResolvedValue([]);
  mockIdempotencyGroupBy.mockResolvedValue([]);
  mockInboxFindFirst.mockResolvedValue(null);
  mockOutboundFindFirst.mockResolvedValue(null);
  mockInboxCount.mockResolvedValue(0);
  mockOutboundCount.mockResolvedValue(0);
  mockCursorCount.mockResolvedValue(0);
  mockBookingCount.mockResolvedValue(0);
  mockBookingGroupBy.mockResolvedValue([]);
  mockIntegrationCount.mockResolvedValue(0);
  mockInboxGroupByTenant.mockResolvedValue([]);
  mockOutboundGroupByTenant.mockResolvedValue([]);
  mockSyncEventFindMany.mockResolvedValue([]);
});

describe("GET /api/admin/pms-reliability/health", () => {
  it("rejects without the cron secret", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("rejects wrong secret", async () => {
    const res = await GET(makeReq("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("returns the expected shape with zero state", async () => {
    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.tables.PmsWebhookInbox).toBeDefined();
    expect(body.tables.PmsOutboundJob).toBeDefined();
    expect(body.tables.PmsIdempotencyKey).toBeDefined();
    expect(body.tables.ReconciliationCursor).toBeDefined();
    expect(body.tenants.withOpenCircuit).toBe(0);
    expect(body.tenants.withCompensationFailed).toBe(0);
    expect(body.backlog.inboxPending).toBe(0);
  });

  it("aggregates status counts correctly", async () => {
    mockInboxGroupBy.mockResolvedValueOnce([
      { status: "PENDING", _count: 3 },
      { status: "PROCESSED", _count: 100 },
      { status: "DEAD", _count: 2 },
    ]);
    mockOutboundGroupBy.mockResolvedValueOnce([
      { status: "COMPLETED", _count: 50 },
      { status: "FAILED", _count: 1 },
    ]);

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.tables.PmsWebhookInbox.total).toBe(105);
    expect(body.tables.PmsWebhookInbox.byStatus).toEqual({
      PENDING: 3,
      PROCESSED: 100,
      DEAD: 2,
    });
    expect(body.backlog.inboxPending).toBe(3); // PENDING only (FAILED=0)
    expect(body.backlog.outboundPending).toBe(1); // FAILED=1
  });

  it("computes oldestPendingAgeSec from the oldest PENDING row", async () => {
    mockInboxFindFirst
      .mockResolvedValueOnce({
        receivedAt: new Date(Date.now() - 120_000), // 2 min ago
      })
      .mockResolvedValueOnce(null); // no DEAD row

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.tables.PmsWebhookInbox.oldestPendingAgeSec).toBeGreaterThanOrEqual(119);
    expect(body.tables.PmsWebhookInbox.oldestPendingAgeSec).toBeLessThanOrEqual(121);
  });

  it("extracts last-cron ages from recent SyncEvent payloads", async () => {
    const now = Date.now();
    mockSyncEventFindMany.mockResolvedValueOnce([
      {
        eventType: "sync.completed",
        payload: { tier: "hot", bookingsScanned: 0 },
        createdAt: new Date(now - 30_000),
      },
      {
        eventType: "sync.completed",
        payload: { tier: "warm" },
        createdAt: new Date(now - 600_000),
      },
      {
        eventType: "sync.completed",
        payload: { source: "webhook" },
        createdAt: new Date(now - 10_000),
      },
    ]);

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.crons.reconcileHotAgeSec).toBeGreaterThanOrEqual(29);
    expect(body.crons.reconcileHotAgeSec).toBeLessThanOrEqual(31);
    expect(body.crons.reconcileWarmAgeSec).toBeGreaterThanOrEqual(599);
    expect(body.crons.reconcileColdAgeSec).toBeNull(); // no cold event
    expect(body.crons.lastWebhookIngestAgeSec).toBeGreaterThanOrEqual(9);
  });

  it("counts stranded PROCESSING rows via count with lastAttemptAt filter", async () => {
    // Default mock returns 0; here we return 7 for the first call.
    mockInboxCount.mockResolvedValueOnce(7);
    mockOutboundCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.tables.PmsWebhookInbox.strandedProcessing).toBe(7);
    expect(body.tables.PmsOutboundJob.strandedProcessing).toBe(3);
    expect(body.tables.PmsOutboundJob.strandedCompensating).toBe(1);
  });
});
