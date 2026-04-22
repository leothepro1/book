import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const runSaga = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    cancellationRequest: {
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));
vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));
vi.mock("@/app/_lib/cancellations/engine", () => ({
  runCancellationSaga: (...a: unknown[]) => runSaga(...a),
}));

const { GET } = await import("./route");

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/retry-cancellation-saga", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cron/retry-cancellation-saga", () => {
  it("401s on missing/bad bearer", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("queries OPEN rows with nextAttemptAt due and attempts below cap", async () => {
    findMany.mockResolvedValue([]);

    await GET(req("Bearer test-secret"));

    const callArgs = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      take: number;
      orderBy: Record<string, string>;
    };
    expect(callArgs.where).toMatchObject({
      status: "OPEN",
      attempts: { lt: 5 },
    });
    expect(callArgs.take).toBe(20);
  });

  it("runs saga sequentially for each due row", async () => {
    findMany.mockResolvedValue([
      { id: "cr_1", tenantId: "tenant_1" },
      { id: "cr_2", tenantId: "tenant_1" },
      { id: "cr_3", tenantId: "tenant_2" },
    ]);
    runSaga.mockResolvedValue(undefined);

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as {
      found: number;
      processed: number;
      errors: number;
    };

    expect(body.found).toBe(3);
    expect(body.processed).toBe(3);
    expect(body.errors).toBe(0);
    expect(runSaga).toHaveBeenCalledTimes(3);
  });

  it("one saga crash does not stop the batch", async () => {
    findMany.mockResolvedValue([
      { id: "cr_1", tenantId: "tenant_1" },
      { id: "cr_2", tenantId: "tenant_1" },
      { id: "cr_3", tenantId: "tenant_2" },
    ]);
    runSaga
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("DB blip"))
      .mockResolvedValueOnce(undefined);

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as {
      processed: number;
      errors: number;
    };

    expect(body.processed).toBe(2);
    expect(body.errors).toBe(1);
    expect(runSaga).toHaveBeenCalledTimes(3);
  });

  it("returns zero-counts when nothing is due", async () => {
    findMany.mockResolvedValue([]);
    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as {
      found: number;
      processed: number;
    };
    expect(body.found).toBe(0);
    expect(body.processed).toBe(0);
    expect(runSaga).not.toHaveBeenCalled();
  });
});
