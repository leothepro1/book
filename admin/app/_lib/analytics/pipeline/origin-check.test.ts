import { describe, expect, it } from "vitest";

import { checkAnalyticsOrigin } from "./origin-check";

// Default platform base domain for tests. Mirrors the FALLBACK in
// app/_lib/platform/constants.ts. Tests that exercise alternative
// configurations override this explicitly.
const RUTGR = "rutgr.com";

describe("checkAnalyticsOrigin — production (baseDomain=rutgr.com)", () => {
  const prodEnv = {
    nodeEnv: "production",
    vercelEnv: "production",
    baseDomain: RUTGR,
  } as const;

  it("accepts canonical <slug>.rutgr.com host with matching origin", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.rutgr.com",
        origin: "https://apelviken.rutgr.com",
        ...prodEnv,
      }),
    ).toEqual({ ok: true, reason: "ok" });
  });

  it("accepts canonical host with null origin (opaque sandbox iframe)", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.rutgr.com",
        origin: null,
        ...prodEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts the literal 'null' origin string", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.rutgr.com",
        origin: "null",
        ...prodEnv,
      }).ok,
    ).toBe(true);
  });

  it("rejects when host slug does not match origin slug", () => {
    const result = checkAnalyticsOrigin({
      host: "apelviken.rutgr.com",
      origin: "https://other-tenant.rutgr.com",
      ...prodEnv,
    });
    expect(result).toEqual({ ok: false, reason: "origin_slug_mismatch" });
  });

  it("rejects HTTP origin even when slugs match", () => {
    const result = checkAnalyticsOrigin({
      host: "apelviken.rutgr.com",
      origin: "http://apelviken.rutgr.com",
      ...prodEnv,
    });
    expect(result).toEqual({ ok: false, reason: "origin_invalid_in_prod" });
  });

  it("rejects an arbitrary domain pretending to be a tenant", () => {
    expect(
      checkAnalyticsOrigin({
        host: "evil.example.com",
        origin: "https://evil.example.com",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("rejects localhost in production unconditionally", () => {
    expect(
      checkAnalyticsOrigin({
        host: "localhost:3000",
        origin: "http://localhost:3000",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });

    expect(
      checkAnalyticsOrigin({
        host: "localhost",
        origin: "http://localhost",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("rejects 127.0.0.1 in production", () => {
    expect(
      checkAnalyticsOrigin({
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("rejects *.vercel.app in production when VERCEL_ENV=production", () => {
    expect(
      checkAnalyticsOrigin({
        host: "bedfront-prod-abc123.vercel.app",
        origin: "https://bedfront-prod-abc123.vercel.app",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("rejects subdomain that has uppercase or invalid chars", () => {
    expect(
      checkAnalyticsOrigin({
        host: "INVALID.rutgr.com",
        origin: "https://INVALID.rutgr.com",
        ...prodEnv,
      }).ok,
    ).toBe(false);

    expect(
      checkAnalyticsOrigin({
        host: "has_underscore.rutgr.com",
        origin: "https://has_underscore.rutgr.com",
        ...prodEnv,
      }).ok,
    ).toBe(false);
  });

  it("rejects when host header is missing", () => {
    expect(
      checkAnalyticsOrigin({
        host: null,
        origin: "https://apelviken.rutgr.com",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_missing" });
  });

  // ── Domain-drift regression guards (refinement #1) ───────────────

  it("REGRESSION: rejects <slug>.bedfront.com in prod when baseDomain=rutgr.com", () => {
    // PR-A's origin-check hardcoded bedfront.com. PR-B fixes this to
    // read from getPlatformBaseDomain(). This test guards against
    // regressing the hardcoded literal — silent acceptance of the
    // wrong production domain is the PR-A bug we're closing.
    const result = checkAnalyticsOrigin({
      host: "apelviken.bedfront.com",
      origin: "https://apelviken.bedfront.com",
      ...prodEnv,
    });
    expect(result).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("rejects naked root domain (no slug prefix) — refinement #1", () => {
    // Naked "rutgr.com" must never reach the dispatch endpoint — there
    // is no tenant for the apex domain. The regex shape requires at
    // least one slug character before the base, so this is rejected
    // by structure, not by tenant lookup.
    expect(
      checkAnalyticsOrigin({
        host: "rutgr.com",
        origin: "https://rutgr.com",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("rejects host with double-dot (no slug prefix)", () => {
    expect(
      checkAnalyticsOrigin({
        host: ".rutgr.com",
        origin: "https://.rutgr.com",
        ...prodEnv,
      }).ok,
    ).toBe(false);
  });
});

describe("checkAnalyticsOrigin — production with custom baseDomain", () => {
  it("accepts <slug>.foo.com when baseDomain=foo.com, rejects bar.com", () => {
    // Operator changes NEXT_PUBLIC_BASE_DOMAIN to foo.com. The check
    // must follow that decision via the baseDomain param — no
    // hardcoded fallback to a previous domain.
    const env = {
      nodeEnv: "production",
      vercelEnv: "production",
      baseDomain: "foo.com",
    } as const;

    expect(
      checkAnalyticsOrigin({
        host: "tenant-a.foo.com",
        origin: "https://tenant-a.foo.com",
        ...env,
      }),
    ).toEqual({ ok: true, reason: "ok" });

    expect(
      checkAnalyticsOrigin({
        host: "tenant-a.bar.com",
        origin: "https://tenant-a.bar.com",
        ...env,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });

    // Even rutgr.com is rejected when baseDomain has been overridden
    // to foo.com — no implicit fallback list.
    expect(
      checkAnalyticsOrigin({
        host: "tenant-a.rutgr.com",
        origin: "https://tenant-a.rutgr.com",
        ...env,
      }),
    ).toEqual({ ok: false, reason: "host_invalid_in_prod" });
  });

  it("safely handles baseDomain with regex meta characters in the literal", () => {
    // Defensive: the baseDomain string is escaped before being baked
    // into the regex, so a (hypothetical, never legal) value
    // containing a `.` or `+` cannot be exploited to match arbitrary
    // hosts. Using "rutgr.com" again here only because the function
    // doesn't validate base-domain shape — it just escapes for safety.
    const env = {
      nodeEnv: "production",
      vercelEnv: "production",
      baseDomain: "ru.gr.com", // dot in slug position
    } as const;

    expect(
      checkAnalyticsOrigin({
        host: "tenant-a.ru.gr.com",
        origin: "https://tenant-a.ru.gr.com",
        ...env,
      }).ok,
    ).toBe(true);

    // The escaped `.` must NOT match any single character — so
    // `ruXgr.com` style tricks are rejected.
    expect(
      checkAnalyticsOrigin({
        host: "tenant-a.ruXgr.com",
        origin: "https://tenant-a.ruXgr.com",
        ...env,
      }).ok,
    ).toBe(false);
  });
});

describe("checkAnalyticsOrigin — Vercel preview", () => {
  const previewEnv = {
    nodeEnv: "production",
    vercelEnv: "preview",
    baseDomain: RUTGR,
  } as const;

  it("accepts *.vercel.app on preview deployments", () => {
    expect(
      checkAnalyticsOrigin({
        host: "bedfront-pr-42-abc.vercel.app",
        origin: "https://bedfront-pr-42-abc.vercel.app",
        ...previewEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts canonical <slug>.rutgr.com on preview", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.rutgr.com",
        origin: "https://apelviken.rutgr.com",
        ...previewEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts legacy <slug>.bedfront.com on preview (operational tolerance)", () => {
    // Per the locked spec: previews accept *.bedfront.com regardless
    // of the configured baseDomain. This covers the operational case
    // where preview env may run against either the current or a
    // future/legacy domain without code changes.
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.bedfront.com",
        origin: "https://apelviken.bedfront.com",
        ...previewEnv,
      }).ok,
    ).toBe(true);
  });

  it("preview slug match still required for legacy bedfront.com", () => {
    // Even on preview, host slug must equal origin slug.
    const result = checkAnalyticsOrigin({
      host: "apelviken.bedfront.com",
      origin: "https://other-tenant.bedfront.com",
      ...previewEnv,
    });
    expect(result).toEqual({ ok: false, reason: "origin_slug_mismatch" });
  });

  it("rejects HTTP vercel.app even on preview", () => {
    expect(
      checkAnalyticsOrigin({
        host: "bedfront-pr-42.vercel.app",
        origin: "http://bedfront-pr-42.vercel.app",
        ...previewEnv,
      }).ok,
    ).toBe(false);
  });

  it("rejects unrelated *.example.com on preview", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.example.com",
        origin: "https://apelviken.example.com",
        ...previewEnv,
      }).ok,
    ).toBe(false);
  });

  it("still rejects localhost on preview", () => {
    expect(
      checkAnalyticsOrigin({
        host: "localhost:3000",
        origin: "http://localhost:3000",
        ...previewEnv,
      }).ok,
    ).toBe(false);
  });
});

describe("checkAnalyticsOrigin — development", () => {
  const devEnv = {
    nodeEnv: "development",
    vercelEnv: undefined,
    baseDomain: RUTGR,
  } as const;

  it("accepts localhost on any port", () => {
    expect(
      checkAnalyticsOrigin({
        host: "localhost:3000",
        origin: "http://localhost:3000",
        ...devEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts 127.0.0.1", () => {
    expect(
      checkAnalyticsOrigin({
        host: "127.0.0.1:3001",
        origin: "http://127.0.0.1:3001",
        ...devEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts Codespaces *.app.github.dev", () => {
    expect(
      checkAnalyticsOrigin({
        host: "leo-bookings-3000.app.github.dev",
        origin: "https://leo-bookings-3000.app.github.dev",
        ...devEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts dev host with null origin (worker beacon edge case)", () => {
    expect(
      checkAnalyticsOrigin({
        host: "localhost:3000",
        origin: null,
        ...devEnv,
      }).ok,
    ).toBe(true);
  });

  it("rejects rutgr.com in dev (DNS doesn't resolve dev tenants)", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.rutgr.com",
        origin: "https://apelviken.rutgr.com",
        ...devEnv,
      }).ok,
    ).toBe(false);
  });

  it("rejects bedfront.com in dev (legacy preview tolerance is preview-only)", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.bedfront.com",
        origin: "https://apelviken.bedfront.com",
        ...devEnv,
      }).ok,
    ).toBe(false);
  });

  it("rejects arbitrary external domains in dev", () => {
    expect(
      checkAnalyticsOrigin({
        host: "evil.example.com",
        origin: "https://evil.example.com",
        ...devEnv,
      }).ok,
    ).toBe(false);
  });
});
