import { describe, expect, it } from "vitest";

import { checkAnalyticsOrigin } from "./origin-check";

describe("checkAnalyticsOrigin — production", () => {
  const prodEnv = { nodeEnv: "production", vercelEnv: "production" } as const;

  it("accepts canonical <slug>.bedfront.com host with matching origin", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.bedfront.com",
        origin: "https://apelviken.bedfront.com",
        ...prodEnv,
      }),
    ).toEqual({ ok: true, reason: "ok" });
  });

  it("accepts canonical host with null origin (opaque sandbox iframe)", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.bedfront.com",
        origin: null,
        ...prodEnv,
      }).ok,
    ).toBe(true);
  });

  it("accepts the literal 'null' origin string", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.bedfront.com",
        origin: "null",
        ...prodEnv,
      }).ok,
    ).toBe(true);
  });

  it("rejects when host slug does not match origin slug", () => {
    const result = checkAnalyticsOrigin({
      host: "apelviken.bedfront.com",
      origin: "https://other-tenant.bedfront.com",
      ...prodEnv,
    });
    expect(result).toEqual({ ok: false, reason: "origin_slug_mismatch" });
  });

  it("rejects HTTP origin even when slugs match", () => {
    const result = checkAnalyticsOrigin({
      host: "apelviken.bedfront.com",
      origin: "http://apelviken.bedfront.com",
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
        host: "INVALID.bedfront.com",
        origin: "https://INVALID.bedfront.com",
        ...prodEnv,
      }).ok,
    ).toBe(false);

    expect(
      checkAnalyticsOrigin({
        host: "has_underscore.bedfront.com",
        origin: "https://has_underscore.bedfront.com",
        ...prodEnv,
      }).ok,
    ).toBe(false);
  });

  it("rejects when host header is missing", () => {
    expect(
      checkAnalyticsOrigin({
        host: null,
        origin: "https://apelviken.bedfront.com",
        ...prodEnv,
      }),
    ).toEqual({ ok: false, reason: "host_missing" });
  });
});

describe("checkAnalyticsOrigin — Vercel preview", () => {
  const previewEnv = { nodeEnv: "production", vercelEnv: "preview" } as const;

  it("accepts *.vercel.app on preview deployments", () => {
    expect(
      checkAnalyticsOrigin({
        host: "bedfront-pr-42-abc.vercel.app",
        origin: "https://bedfront-pr-42-abc.vercel.app",
        ...previewEnv,
      }).ok,
    ).toBe(true);
  });

  it("still accepts canonical bedfront.com on preview (custom domain attached)", () => {
    expect(
      checkAnalyticsOrigin({
        host: "apelviken.bedfront.com",
        origin: "https://apelviken.bedfront.com",
        ...previewEnv,
      }).ok,
    ).toBe(true);
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
  const devEnv = { nodeEnv: "development", vercelEnv: undefined } as const;

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

  it("rejects bedfront.com in dev (DNS doesn't resolve dev tenants)", () => {
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
