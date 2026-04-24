import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
const tenantLocaleFindFirst = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: (...a: unknown[]) => tenantFindUnique(...a),
    },
    tenantLocale: {
      findFirst: (...a: unknown[]) => tenantLocaleFindFirst(...a),
    },
  },
}));

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret", DEV_ORG_ID: "org_dev_1" },
}));

const { GET } = await import("./route");

function req(opts: { host?: string; secret?: string } = {}): Request {
  const host = opts.host ?? "grand-hotel.rutgr.com";
  const url = new URL("http://localhost/api/internal/resolve-tenant-by-host");
  url.searchParams.set("host", host);
  const headers: Record<string, string> = {};
  if (opts.secret !== undefined) headers["x-cron-secret"] = opts.secret;
  return new Request(url.toString(), { headers });
}

function reqNoHost(secret: string): Request {
  return new Request(
    "http://localhost/api/internal/resolve-tenant-by-host",
    { headers: { "x-cron-secret": secret } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/internal/resolve-tenant-by-host", () => {
  it("rejects missing x-cron-secret with 403", async () => {
    const res = await GET(req() as never);
    expect(res.status).toBe(403);
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it("rejects wrong x-cron-secret with 403", async () => {
    const res = await GET(req({ secret: "wrong" }) as never);
    expect(res.status).toBe(403);
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when host param is missing", async () => {
    const res = await GET(reqNoHost("test-secret") as never);
    expect(res.status).toBe(400);
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it("resolves production subdomain by portalSlug", async () => {
    tenantFindUnique.mockResolvedValue({ id: "tenant_1" });
    tenantLocaleFindFirst.mockResolvedValue({ locale: "sv" });

    const res = await GET(
      req({ host: "grand-hotel.rutgr.com", secret: "test-secret" }) as never,
    );
    const body = (await res.json()) as {
      tenant: { id: string; defaultLocale: string } | null;
    };

    expect(res.status).toBe(200);
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { portalSlug: "grand-hotel" },
      select: { id: true },
    });
    expect(body.tenant).toEqual({ id: "tenant_1", defaultLocale: "sv" });
  });

  it("returns tenant: null for unknown subdomain", async () => {
    tenantFindUnique.mockResolvedValue(null);

    const res = await GET(
      req({ host: "unknown.rutgr.com", secret: "test-secret" }) as never,
    );
    const body = (await res.json()) as { tenant: unknown };

    expect(res.status).toBe(200);
    expect(body.tenant).toBeNull();
    expect(tenantLocaleFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to 'sv' when no primary TenantLocale row exists", async () => {
    tenantFindUnique.mockResolvedValue({ id: "tenant_1" });
    tenantLocaleFindFirst.mockResolvedValue(null);

    const res = await GET(
      req({ host: "hotel.rutgr.com", secret: "test-secret" }) as never,
    );
    const body = (await res.json()) as {
      tenant: { defaultLocale: string };
    };

    expect(body.tenant.defaultLocale).toBe("sv");
  });

  it("resolves localhost via DEV_ORG_ID + clerkOrgId", async () => {
    tenantFindUnique.mockResolvedValue({ id: "tenant_dev" });
    tenantLocaleFindFirst.mockResolvedValue({ locale: "en" });

    const res = await GET(
      req({ host: "localhost:3000", secret: "test-secret" }) as never,
    );
    const body = (await res.json()) as {
      tenant: { id: string; defaultLocale: string };
    };

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_dev_1" },
      select: { id: true },
    });
    expect(body.tenant).toEqual({ id: "tenant_dev", defaultLocale: "en" });
  });

  it("resolves codespace host via DEV_ORG_ID", async () => {
    tenantFindUnique.mockResolvedValue({ id: "tenant_dev" });
    tenantLocaleFindFirst.mockResolvedValue({ locale: "sv" });

    await GET(
      req({
        host: "fluffy-bunny-3000.app.github.dev",
        secret: "test-secret",
      }) as never,
    );

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_dev_1" },
      select: { id: true },
    });
  });

  it("returns null for bare host with no dot (malformed)", async () => {
    // "rutgr.com" with no subdomain — dotIndex > 0 so slug = "rutgr"
    // but "localhost" w/o any dot falls through entirely.
    const res = await GET(
      req({ host: "malformed", secret: "test-secret" }) as never,
    );
    const body = (await res.json()) as { tenant: unknown };

    expect(body.tenant).toBeNull();
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });
});
