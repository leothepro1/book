import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTenantUrl, getTenantEmailFrom } from "./tenant-url";

describe("getTenantUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds basic absolute URL from portalSlug", () => {
    expect(getTenantUrl({ portalSlug: "hotel-x" })).toBe(
      "https://hotel-x.rutgr.com",
    );
  });

  it("appends path when provided", () => {
    expect(getTenantUrl({ portalSlug: "hotel-x" }, { path: "/checkout" })).toBe(
      "https://hotel-x.rutgr.com/checkout",
    );
  });

  it("prefixes locale when provided", () => {
    expect(getTenantUrl({ portalSlug: "hotel-x" }, { locale: "en" })).toBe(
      "https://hotel-x.rutgr.com/en",
    );
  });

  it("combines locale and path in correct order", () => {
    expect(
      getTenantUrl({ portalSlug: "hotel-x" }, { locale: "en", path: "/checkout" }),
    ).toBe("https://hotel-x.rutgr.com/en/checkout");
  });

  it("returns path-only when absolute=false", () => {
    expect(
      getTenantUrl({ portalSlug: "hotel-x" }, { path: "/checkout", absolute: false }),
    ).toBe("/checkout");
  });

  it("returns '/' when absolute=false and no path/locale", () => {
    expect(getTenantUrl({ portalSlug: "hotel-x" }, { absolute: false })).toBe("/");
  });

  it("combines locale + path when absolute=false", () => {
    expect(
      getTenantUrl(
        { portalSlug: "hotel-x" },
        { locale: "sv", path: "/account", absolute: false },
      ),
    ).toBe("/sv/account");
  });

  it("throws when portalSlug is null", () => {
    expect(() => getTenantUrl({ portalSlug: null })).toThrow(
      /Tenant has no portalSlug/,
    );
  });

  it("throws when path doesn't start with '/'", () => {
    expect(() =>
      getTenantUrl({ portalSlug: "hotel-x" }, { path: "checkout" as string }),
    ).toThrow(/path must start with "\/"/);
  });

  it("reads NEXT_PUBLIC_BASE_DOMAIN env var", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "staging.example.com");
    expect(getTenantUrl({ portalSlug: "hotel-x" })).toBe(
      "https://hotel-x.staging.example.com",
    );
  });
});

describe("getTenantEmailFrom", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'Name <custom@example.com>' when emailFrom set", () => {
    expect(
      getTenantEmailFrom({
        portalSlug: "grand-x4k9mq",
        emailFrom: "custom@example.com",
        emailFromName: null,
        name: "Grand Hotel",
      }),
    ).toBe("Grand Hotel <custom@example.com>");
  });

  it("uses emailFromName when provided", () => {
    expect(
      getTenantEmailFrom({
        portalSlug: "grand-x4k9mq",
        emailFrom: "info@gh.se",
        emailFromName: "GH Support",
        name: "Grand Hotel",
      }),
    ).toBe("GH Support <info@gh.se>");
  });

  it("derives noreply@{slug}.{baseDomain} when emailFrom is null", () => {
    expect(
      getTenantEmailFrom({
        portalSlug: "apelviken-dev-3vtczx",
        emailFrom: null,
        emailFromName: null,
        name: "Apelviken",
      }),
    ).toBe("Apelviken <noreply@apelviken-dev-3vtczx.rutgr.com>");
  });

  it("falls back to noreply@{baseDomain} when no portalSlug and no emailFrom", () => {
    expect(
      getTenantEmailFrom({
        portalSlug: null,
        emailFrom: null,
        emailFromName: null,
        name: "New Hotel",
      }),
    ).toBe("New Hotel <noreply@rutgr.com>");
  });

  it("respects NEXT_PUBLIC_BASE_DOMAIN for derived addresses", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "staging.example.com");
    expect(
      getTenantEmailFrom({
        portalSlug: "hotel-x",
        emailFrom: null,
        emailFromName: null,
        name: "Hotel X",
      }),
    ).toBe("Hotel X <noreply@hotel-x.staging.example.com>");
  });
});
