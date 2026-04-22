import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
const eventCreate = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    cancellationRequest: {
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
    cancellationEvent: {
      create: (...a: unknown[]) => eventCreate(...a),
    },
  },
}));
vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { GET } = await import("./route");

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/expire-cancellations", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cron/expire-cancellations", () => {
  it("401s on missing/bad bearer", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("transitions expired REQUESTED rows to EXPIRED and emits audit event", async () => {
    findMany.mockResolvedValue([
      { id: "cr_1", tenantId: "tenant_1", version: 1 },
      { id: "cr_2", tenantId: "tenant_1", version: 3 },
    ]);
    updateMany.mockResolvedValue({ count: 1 });

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as { ok: boolean; transitioned: number };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.transitioned).toBe(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(eventCreate).toHaveBeenCalledTimes(2);

    // Each transition goes through a version-guarded updateMany.
    const firstCall = updateMany.mock.calls[0][0] as {
      where: { id: string; status: string; version: number };
      data: { status: string };
    };
    expect(firstCall.where.id).toBe("cr_1");
    expect(firstCall.where.status).toBe("REQUESTED");
    expect(firstCall.where.version).toBe(1);
    expect(firstCall.data.status).toBe("EXPIRED");
  });

  it("counts skipped rows when optimistic update loses the race", async () => {
    findMany.mockResolvedValue([
      { id: "cr_1", tenantId: "tenant_1", version: 1 },
    ]);
    updateMany.mockResolvedValue({ count: 0 }); // admin approved first

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as { transitioned: number; skipped: number };

    expect(body.transitioned).toBe(0);
    expect(body.skipped).toBe(1);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("survives event-write failure (row already transitioned, no rollback)", async () => {
    findMany.mockResolvedValue([
      { id: "cr_1", tenantId: "tenant_1", version: 1 },
    ]);
    updateMany.mockResolvedValue({ count: 1 });
    eventCreate.mockRejectedValue(new Error("audit write down"));

    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as { ok: boolean; transitioned: number };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.transitioned).toBe(1);
  });

  it("returns zero-counts when nothing is due", async () => {
    findMany.mockResolvedValue([]);
    const res = await GET(req("Bearer test-secret"));
    const body = (await res.json()) as {
      ok: boolean;
      found: number;
      transitioned: number;
    };
    expect(body.found).toBe(0);
    expect(body.transitioned).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
