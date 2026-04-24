import { describe, it, expect, vi, beforeEach } from "vitest";

const redirectFindUnique = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    seoRedirect: {
      findUnique: (...a: unknown[]) => redirectFindUnique(...a),
    },
  },
}));

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));

const { GET } = await import("./route");

function req(opts: {
  tenantId?: string;
  path?: string;
  locale?: string;
  secret?: string;
}): Request {
  const url = new URL("http://localhost/api/internal/seo-redirect-lookup");
  if (opts.tenantId !== undefined) url.searchParams.set("tenantId", opts.tenantId);
  if (opts.path !== undefined) url.searchParams.set("path", opts.path);
  if (opts.locale !== undefined) url.searchParams.set("locale", opts.locale);
  const headers: Record<string, string> = {};
  if (opts.secret !== undefined) headers["x-cron-secret"] = opts.secret;
  return new Request(url.toString(), { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/internal/seo-redirect-lookup", () => {
  it("rejects missing x-cron-secret with 403", async () => {
    const res = await GET(
      req({ tenantId: "t_1", path: "/x", locale: "sv" }) as never,
    );
    expect(res.status).toBe(403);
    expect(redirectFindUnique).not.toHaveBeenCalled();
  });

  it("rejects wrong secret with 403", async () => {
    const res = await GET(
      req({ tenantId: "t_1", path: "/x", locale: "sv", secret: "bad" }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when any param missing", async () => {
    expect(
      (await GET(
        req({ path: "/x", locale: "sv", secret: "test-secret" }) as never,
      )).status,
    ).toBe(400);
    expect(
      (await GET(
        req({ tenantId: "t_1", locale: "sv", secret: "test-secret" }) as never,
      )).status,
    ).toBe(400);
    expect(
      (await GET(
        req({ tenantId: "t_1", path: "/x", secret: "test-secret" }) as never,
      )).status,
    ).toBe(400);
    expect(redirectFindUnique).not.toHaveBeenCalled();
  });

  it("returns the redirect row for a matching path", async () => {
    redirectFindUnique.mockResolvedValue({
      id: "rdr_1",
      toPath: "/shop/products/new-slug",
      statusCode: 301,
    });

    const res = await GET(
      req({
        tenantId: "t_1",
        path: "/shop/products/old-slug",
        locale: "sv",
        secret: "test-secret",
      }) as never,
    );
    const body = (await res.json()) as {
      redirect: { toPath: string; statusCode: number } | null;
    };

    expect(redirectFindUnique).toHaveBeenCalledWith({
      where: {
        tenantId_fromPath_locale: {
          tenantId: "t_1",
          fromPath: "/shop/products/old-slug",
          locale: "sv",
        },
      },
      select: { id: true, toPath: true, statusCode: true },
    });
    expect(body.redirect).toEqual({
      id: "rdr_1",
      toPath: "/shop/products/new-slug",
      statusCode: 301,
    });
  });

  it("returns null when no redirect matches", async () => {
    redirectFindUnique.mockResolvedValue(null);

    const res = await GET(
      req({
        tenantId: "t_1",
        path: "/stays/nothing",
        locale: "sv",
        secret: "test-secret",
      }) as never,
    );
    const body = (await res.json()) as { redirect: unknown };

    expect(body.redirect).toBeNull();
  });

  it("applies normalizeRedirectPath before lookup (uppercase + trailing slash)", async () => {
    redirectFindUnique.mockResolvedValue(null);

    await GET(
      req({
        tenantId: "t_1",
        path: "/Shop/Products/FOO-BAR/",
        locale: "sv",
        secret: "test-secret",
      }) as never,
    );

    const call = redirectFindUnique.mock.calls[0][0] as {
      where: { tenantId_fromPath_locale: { fromPath: string } };
    };
    expect(call.where.tenantId_fromPath_locale.fromPath).toBe(
      "/shop/products/foo-bar",
    );
  });

  it("passes tenantId into the where clause for isolation", async () => {
    // Not a real cross-tenant test (that needs DB), but the route
    // MUST include tenantId in the unique lookup — verify it's in
    // the where clause that goes to Prisma.
    redirectFindUnique.mockResolvedValue(null);

    await GET(
      req({
        tenantId: "tenant_B",
        path: "/shop/products/foo",
        locale: "sv",
        secret: "test-secret",
      }) as never,
    );

    const call = redirectFindUnique.mock.calls[0][0] as {
      where: { tenantId_fromPath_locale: { tenantId: string } };
    };
    expect(call.where.tenantId_fromPath_locale.tenantId).toBe("tenant_B");
  });
});
