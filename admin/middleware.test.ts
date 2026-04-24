import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Clerk's default middleware factory tries to read env at import
// time — stub it so importing middleware.ts in a test context
// doesn't crash.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (fn: unknown) => fn,
  createRouteMatcher: () => () => false,
}));

vi.mock("@/app/_lib/translations/locale-cache", () => ({
  getCachedLocalePublished: () => null,
  setCachedLocalePublished: vi.fn(),
}));

vi.mock("@/app/_lib/translations/locales", () => ({
  SUPPORTED_LOCALES: [{ code: "sv" }, { code: "en" }],
  PRIMARY_LOCALE: "sv",
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-secret";

const { handleSeoRedirect, __resetSeoRedirectCachesForTest } = await import(
  "./middleware"
);

function makeReq(
  pathname: string,
  opts: { host?: string; query?: string } = {},
): NextRequest {
  const host = opts.host ?? "grand-hotel.rutgr.com";
  const url = `https://${host}${pathname}${opts.query ? `?${opts.query}` : ""}`;
  return new NextRequest(url, {
    headers: { host },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  __resetSeoRedirectCachesForTest();
  fetchMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
  process.env.CRON_SECRET = "test-secret";
});

describe("handleSeoRedirect — fast-path filter", () => {
  it("skips non-redirectable paths entirely (no fetch calls)", async () => {
    const res = await handleSeoRedirect(makeReq("/api/webhooks/stripe"));
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips /editor/* paths", async () => {
    const res = await handleSeoRedirect(makeReq("/editor/home"));
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips /shop root (must have a product/collection segment)", async () => {
    expect(
      await handleSeoRedirect(makeReq("/shop/checkout/success")),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("processes /shop/products/* paths", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tenant: null })); // tenant lookup
    await handleSeoRedirect(makeReq("/shop/products/foo"));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("processes /shop/collections/* paths", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tenant: null }));
    await handleSeoRedirect(makeReq("/shop/collections/summer"));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("processes /stays/* paths", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tenant: null }));
    await handleSeoRedirect(makeReq("/stays/stuga-bjork"));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("processes /stays/categories/* paths", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tenant: null }));
    await handleSeoRedirect(makeReq("/stays/categories/stugor"));
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("handleSeoRedirect — host + tenant resolution", () => {
  it("returns null when request has no Host header", async () => {
    // NextRequest always fills host from the URL, so simulate
    // the missing-host case via a hand-built request where the
    // headers omit host.
    const url = new URL("https://x.rutgr.com/shop/products/foo");
    const req = new NextRequest(url);
    req.headers.delete("host");

    const res = await handleSeoRedirect(req);
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when tenant resolution fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tenant: null }));

    const res = await handleSeoRedirect(
      makeReq("/shop/products/foo"),
    );
    expect(res).toBeNull();
  });

  it("returns null when internal fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const res = await handleSeoRedirect(
      makeReq("/shop/products/foo"),
    );
    expect(res).toBeNull();
  });

  it("handles malformed tenant response shape gracefully", async () => {
    // Route returns { tenant: null } for miss; simulate a
    // different shape (e.g. proxy error) — we should treat as null
    // rather than throw.
    fetchMock.mockResolvedValueOnce(
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );
    const res = await handleSeoRedirect(
      makeReq("/shop/products/foo"),
    );
    expect(res).toBeNull();
  });
});

describe("handleSeoRedirect — 301 serving", () => {
  it("returns NextResponse.redirect with the stored statusCode", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          redirect: {
            id: "rdr_1",
            toPath: "/shop/products/new-slug",
            statusCode: 301,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // hit fire-and-forget

    const res = await handleSeoRedirect(
      makeReq("/shop/products/old-slug"),
    );

    expect(res).not.toBeNull();
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toContain("/shop/products/new-slug");
  });

  it("honors a custom statusCode (e.g. 302)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          redirect: { id: "rdr_2", toPath: "/stays/new", statusCode: 302 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await handleSeoRedirect(makeReq("/stays/old"));
    expect(res?.status).toBe(302);
  });

  it("preserves query string on the destination URL", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          redirect: {
            id: "rdr_1",
            toPath: "/shop/products/new",
            statusCode: 301,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await handleSeoRedirect(
      makeReq("/shop/products/old", { query: "utm_source=newsletter&foo=bar" }),
    );

    const location = res?.headers.get("location") ?? "";
    expect(location).toContain("utm_source=newsletter");
    expect(location).toContain("foo=bar");
  });

  it("normalizes path before lookup (uppercase input)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ redirect: null }));

    await handleSeoRedirect(makeReq("/Shop/Products/FOO"));

    const lookupCall = fetchMock.mock.calls[1][0] as string;
    expect(lookupCall).toContain("path=%2Fshop%2Fproducts%2Ffoo");
  });
});

describe("handleSeoRedirect — caching", () => {
  it("second call with same host hits tenant cache (no extra fetch)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ redirect: null }))
      // second call's redirect lookup — tenant is cached so no
      // tenant-resolution fetch expected
      .mockResolvedValueOnce(jsonResponse({ redirect: null }));

    await handleSeoRedirect(makeReq("/shop/products/a"));
    await handleSeoRedirect(makeReq("/shop/products/b"));

    // 2 lookups + 1 tenant resolve = 3 fetch calls total
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tenantCalls = fetchMock.mock.calls.filter((c) =>
      (c[0] as string).includes("resolve-tenant-by-host"),
    );
    expect(tenantCalls).toHaveLength(1);
  });

  it("negative redirect result is cached (second call hits no fetch)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ redirect: null }));

    await handleSeoRedirect(makeReq("/shop/products/nowhere"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Same path again — tenant + redirect both cached → zero fetches
    await handleSeoRedirect(makeReq("/shop/products/nowhere"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("negative tenant result is cached (prevents hammering on unknown hosts)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tenant: null }));

    await handleSeoRedirect(
      makeReq("/shop/products/foo", { host: "unknown.rutgr.com" }),
    );
    await handleSeoRedirect(
      makeReq("/shop/products/bar", { host: "unknown.rutgr.com" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleSeoRedirect — hit emission", () => {
  it("fires hit POST but does NOT block the 301 response", async () => {
    let hitResolved = false;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          redirect: {
            id: "rdr_1",
            toPath: "/shop/products/new",
            statusCode: 301,
          },
        }),
      )
      // Hit POST resolves on a later tick. The 301 must come back
      // before this resolves — the test verifies the middleware
      // returned synchronously w.r.t. the lookup, not the hit.
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              hitResolved = true;
              resolve(jsonResponse({ ok: true }));
            }, 50);
          }),
      );

    const res = await handleSeoRedirect(makeReq("/shop/products/old"));

    expect(res?.status).toBe(301);
    // The hit fetch was initiated (3rd call made) but did NOT
    // block — at this point the response is back and
    // hitResolved is still false.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(hitResolved).toBe(false);
  });

  it("swallows hit-emission failures (no throw)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tenant: { id: "t_1", defaultLocale: "sv" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          redirect: {
            id: "rdr_1",
            toPath: "/shop/products/new",
            statusCode: 301,
          },
        }),
      )
      .mockRejectedValueOnce(new Error("hit API down"));

    // Must not throw even though hit fetch rejects.
    const res = await handleSeoRedirect(makeReq("/shop/products/old"));
    expect(res?.status).toBe(301);
  });
});
