import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({ log: vi.fn() }));

import { resolveHreflang } from "./hreflang";
import type {
  Seoable,
  SeoResolutionContext,
  SeoTenantContext,
} from "./types";
import { log } from "../logger";

function makeTenant(overrides: Partial<SeoTenantContext> = {}): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en", "de"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function makeSeoable(overrides: Partial<Seoable> = {}): Seoable {
  return {
    resourceType: "accommodation",
    id: "acc_1",
    tenantId: "tenant_test",
    path: "/accommodations/stuga-1",
    title: "Stuga 1",
    description: null,
    featuredImageId: null,
    seoOverrides: null,
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    publishedAt: new Date("2026-04-01T00:00:00Z"),
    locale: "sv",
    ...overrides,
  };
}

function makeCtx(
  tenant: SeoTenantContext,
  overrides: Partial<SeoResolutionContext> = {},
): SeoResolutionContext {
  return {
    tenant,
    resourceType: "accommodation",
    entity: {},
    locale: "sv",
    ...overrides,
  };
}

describe("resolveHreflang — no canonical override", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("emits one entry per active locale + x-default", () => {
    const tenant = makeTenant();
    const ctx = makeCtx(tenant);
    const entries = resolveHreflang(
      makeSeoable(),
      ctx,
      "/accommodations/stuga-1",
    );
    expect(entries).toEqual([
      { code: "sv", url: "https://apelviken.rutgr.com/accommodations/stuga-1" },
      {
        code: "en",
        url: "https://apelviken.rutgr.com/en/accommodations/stuga-1",
      },
      {
        code: "de",
        url: "https://apelviken.rutgr.com/de/accommodations/stuga-1",
      },
      {
        code: "x-default",
        url: "https://apelviken.rutgr.com/accommodations/stuga-1",
      },
    ]);
  });

  it("default locale is NOT prefixed; non-default locales ARE prefixed", () => {
    const tenant = makeTenant({ defaultLocale: "en", activeLocales: ["en", "sv"] });
    const entries = resolveHreflang(
      makeSeoable(),
      makeCtx(tenant),
      "/accommodations/stuga-1",
    );
    // "en" is default → no prefix. "sv" is non-default → "/sv/..."
    expect(entries[0]).toEqual({
      code: "en",
      url: "https://apelviken.rutgr.com/accommodations/stuga-1",
    });
    expect(entries[1]).toEqual({
      code: "sv",
      url: "https://apelviken.rutgr.com/sv/accommodations/stuga-1",
    });
  });

  it("single-locale tenant still emits two entries (locale + x-default)", () => {
    const tenant = makeTenant({ activeLocales: ["sv"] });
    const entries = resolveHreflang(
      makeSeoable(),
      makeCtx(tenant),
      "/foo",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].code).toBe("sv");
    expect(entries[1].code).toBe("x-default");
    expect(entries[0].url).toBe(entries[1].url);
  });

  it("x-default URL has no locale prefix regardless of request locale", () => {
    const tenant = makeTenant();
    const ctx = makeCtx(tenant, { locale: "de" });
    const entries = resolveHreflang(
      makeSeoable(),
      ctx,
      "/de/accommodations/stuga-1", // resolved for current request
    );
    const xDefault = entries.find((e) => e.code === "x-default");
    expect(xDefault?.url).toBe(
      "https://apelviken.rutgr.com/accommodations/stuga-1",
    );
  });

  it("does NOT emit a canonical_overridden log for unset override", () => {
    resolveHreflang(makeSeoable(), makeCtx(makeTenant()), "/foo");
    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.hreflang.canonical_overridden",
      expect.any(Object),
    );
  });
});

describe("resolveHreflang — canonical override active", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("every locale points at the overridden canonical", () => {
    const tenant = makeTenant();
    const seoable = makeSeoable({
      seoOverrides: {
        canonicalPath: "/my-custom-canonical",
        noindex: false,
        nofollow: false,
      },
    });
    const entries = resolveHreflang(
      seoable,
      makeCtx(tenant),
      "/my-custom-canonical",
    );
    const urls = entries.map((e) => e.url);
    for (const u of urls) {
      expect(u).toBe("https://apelviken.rutgr.com/my-custom-canonical");
    }
    expect(entries.map((e) => e.code)).toEqual(["sv", "en", "de", "x-default"]);
  });

  it("emits canonical_overridden info log with tenantId + resourceId", () => {
    const seoable = makeSeoable({
      seoOverrides: {
        canonicalPath: "/x",
        noindex: false,
        nofollow: false,
      },
    });
    resolveHreflang(seoable, makeCtx(makeTenant()), "/x");
    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.hreflang.canonical_overridden",
      expect.objectContaining({
        tenantId: "tenant_test",
        resourceId: "acc_1",
        canonicalPath: "/x",
      }),
    );
  });
});
