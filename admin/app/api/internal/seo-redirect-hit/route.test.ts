import { describe, it, expect, vi, beforeEach } from "vitest";

const hitCreate = vi.fn();
const mockLog = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    seoRedirectHit: {
      create: (...a: unknown[]) => hitCreate(...a),
    },
  },
}));

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));

vi.mock("@/app/_lib/logger", () => ({
  log: (...a: unknown[]) => mockLog(...a),
}));

const { POST } = await import("./route");

function req(opts: {
  body?: unknown;
  secret?: string;
  rawBody?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.secret !== undefined) headers["x-cron-secret"] = opts.secret;
  const body =
    opts.rawBody !== undefined
      ? opts.rawBody
      : opts.body === undefined
        ? undefined
        : JSON.stringify(opts.body);
  return new Request("http://localhost/api/internal/seo-redirect-hit", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/internal/seo-redirect-hit", () => {
  it("rejects missing x-cron-secret with 403", async () => {
    const res = await POST(
      req({ body: { tenantId: "t_1", redirectId: "rdr_1" } }) as never,
    );
    expect(res.status).toBe(403);
    expect(hitCreate).not.toHaveBeenCalled();
  });

  it("rejects wrong secret with 403", async () => {
    const res = await POST(
      req({
        body: { tenantId: "t_1", redirectId: "rdr_1" },
        secret: "bad",
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(
      req({ rawBody: "not-json-at-all", secret: "test-secret" }) as never,
    );
    expect(res.status).toBe(400);
    expect(hitCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when tenantId is missing", async () => {
    const res = await POST(
      req({ body: { redirectId: "rdr_1" }, secret: "test-secret" }) as never,
    );
    expect(res.status).toBe(400);
    expect(hitCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when redirectId is missing", async () => {
    const res = await POST(
      req({ body: { tenantId: "t_1" }, secret: "test-secret" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when fields are not strings", async () => {
    const res = await POST(
      req({
        body: { tenantId: 123, redirectId: "rdr_1" },
        secret: "test-secret",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(hitCreate).not.toHaveBeenCalled();
  });

  it("inserts a SeoRedirectHit row on success", async () => {
    hitCreate.mockResolvedValue({ id: "hit_1" });

    const res = await POST(
      req({
        body: { tenantId: "t_1", redirectId: "rdr_1" },
        secret: "test-secret",
      }) as never,
    );
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(hitCreate).toHaveBeenCalledWith({
      data: { tenantId: "t_1", redirectId: "rdr_1" },
    });
  });

  it("returns ok:false on DB failure (swallows error, never 500)", async () => {
    hitCreate.mockRejectedValue(new Error("DB down"));

    const res = await POST(
      req({
        body: { tenantId: "t_1", redirectId: "rdr_missing" },
        secret: "test-secret",
      }) as never,
    );
    const body = (await res.json()) as { ok: boolean };

    // Hit logging must NEVER cascade into an error that could
    // surface to the middleware caller as a rejected fetch.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(mockLog).toHaveBeenCalledWith(
      "warn",
      "seo.redirect.hit.failed",
      expect.objectContaining({
        tenantId: "t_1",
        redirectId: "rdr_missing",
      }),
    );
  });
});
