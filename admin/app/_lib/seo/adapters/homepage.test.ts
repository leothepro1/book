import { describe, expect, it } from "vitest";

import { homepageSeoAdapter } from "./homepage";
import type { SeoTenantContext } from "../types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_t",
    siteName: "Apelviken",
    primaryDomain: "apelviken-x.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

// ── toSeoable ─────────────────────────────────────────────────

describe("homepageSeoAdapter.toSeoable — no merchant homepage config", () => {
  it("uses tenant.siteName as the seoOverrides.title (short-circuits title fallback)", () => {
    const s = homepageSeoAdapter.toSeoable({}, makeTenant());
    expect(s.seoOverrides?.title).toBe("Apelviken");
  });

  it("seoable.title is tenant.siteName (fallback source, not used due to override)", () => {
    const s = homepageSeoAdapter.toSeoable({}, makeTenant());
    expect(s.title).toBe("Apelviken");
  });

  it("path is '/'", () => {
    const s = homepageSeoAdapter.toSeoable({}, makeTenant());
    expect(s.path).toBe("/");
  });

  it("id and tenantId are the tenant's id", () => {
    const s = homepageSeoAdapter.toSeoable({}, makeTenant());
    expect(s.id).toBe("tenant_t");
    expect(s.tenantId).toBe("tenant_t");
  });

  it("description is null; featuredImageId is null; noindex false; nofollow false", () => {
    const s = homepageSeoAdapter.toSeoable({}, makeTenant());
    expect(s.description).toBeNull();
    expect(s.featuredImageId).toBeNull();
    expect(s.seoOverrides?.noindex).toBe(false);
    expect(s.seoOverrides?.nofollow).toBe(false);
  });

  it("seoOverrides.description and ogImageId are absent when merchant hasn't set them", () => {
    const s = homepageSeoAdapter.toSeoable({}, makeTenant());
    expect(s.seoOverrides?.description).toBeUndefined();
    expect(s.seoOverrides?.ogImageId).toBeUndefined();
  });

  it("locale is the tenant default locale", () => {
    const s = homepageSeoAdapter.toSeoable(
      {},
      makeTenant({ defaultLocale: "en" }),
    );
    expect(s.locale).toBe("en");
  });
});

describe("homepageSeoAdapter.toSeoable — with merchant homepage config", () => {
  it("merchant homepage.title promotes to seoOverrides.title", () => {
    const s = homepageSeoAdapter.toSeoable(
      {},
      makeTenant({
        seoDefaults: {
          titleTemplate: "{entityTitle} | {siteName}",
          homepage: { title: "Custom Homepage Title", noindex: false },
        },
      }),
    );
    expect(s.seoOverrides?.title).toBe("Custom Homepage Title");
  });

  it("merchant homepage.description promotes to seoOverrides.description", () => {
    const s = homepageSeoAdapter.toSeoable(
      {},
      makeTenant({
        seoDefaults: {
          titleTemplate: "x",
          homepage: { description: "Cosy cabins by the sea", noindex: false },
        },
      }),
    );
    expect(s.seoOverrides?.description).toBe("Cosy cabins by the sea");
  });

  it("merchant homepage.ogImageId promotes to seoOverrides.ogImageId", () => {
    const s = homepageSeoAdapter.toSeoable(
      {},
      makeTenant({
        seoDefaults: {
          titleTemplate: "x",
          homepage: { ogImageId: "media_123", noindex: false },
        },
      }),
    );
    expect(s.seoOverrides?.ogImageId).toBe("media_123");
  });

  it("merchant homepage.noindex promotes to seoOverrides.noindex", () => {
    const s = homepageSeoAdapter.toSeoable(
      {},
      makeTenant({
        seoDefaults: {
          titleTemplate: "x",
          homepage: { noindex: true },
        },
      }),
    );
    expect(s.seoOverrides?.noindex).toBe(true);
  });
});

// ── toStructuredData ──────────────────────────────────────────

describe("homepageSeoAdapter.toStructuredData", () => {
  it("emits one WebSite object", () => {
    const result = homepageSeoAdapter.toStructuredData({}, makeTenant(), "sv");
    expect(result).toHaveLength(1);
    expect(result[0]["@context"]).toBe("https://schema.org");
    expect(result[0]["@type"]).toBe("WebSite");
  });

  it("WebSite.name is tenant.siteName", () => {
    const [site] = homepageSeoAdapter.toStructuredData({}, makeTenant(), "sv");
    expect(site.name).toBe("Apelviken");
  });

  it("WebSite.url is the https://primaryDomain root", () => {
    const [site] = homepageSeoAdapter.toStructuredData({}, makeTenant(), "sv");
    expect(site.url).toBe("https://apelviken-x.rutgr.com");
  });

  it("does NOT duplicate tenant-level Organization / LocalBusiness (the resolver injects those)", () => {
    const result = homepageSeoAdapter.toStructuredData({}, makeTenant(), "sv");
    expect(result.find((o) => o["@type"] === "Organization")).toBeUndefined();
    expect(result.find((o) => o["@type"] === "LocalBusiness")).toBeUndefined();
  });
});

// ── isIndexable ───────────────────────────────────────────────

describe("homepageSeoAdapter.isIndexable", () => {
  it("returns true regardless of merchant config", () => {
    expect(homepageSeoAdapter.isIndexable({})).toBe(true);
  });
});

// ── getSitemapEntries ─────────────────────────────────────────

describe("homepageSeoAdapter.getSitemapEntries", () => {
  it("emits one entry per active locale", () => {
    const entries = homepageSeoAdapter.getSitemapEntries(
      {},
      makeTenant(),
      ["sv", "en", "de"],
    );
    expect(entries).toHaveLength(3);
  });

  it("default-locale entry uses bare '/' path", () => {
    const entries = homepageSeoAdapter.getSitemapEntries(
      {},
      makeTenant(),
      ["sv", "en"],
    );
    expect(entries[0].url).toBe("https://apelviken-x.rutgr.com/");
  });

  it("non-default-locale entry is prefixed with /locale/", () => {
    const entries = homepageSeoAdapter.getSitemapEntries(
      {},
      makeTenant(),
      ["sv", "en"],
    );
    expect(entries[1].url).toBe("https://apelviken-x.rutgr.com/en/");
  });

  it("each entry has hreflang alternates covering every locale", () => {
    const entries = homepageSeoAdapter.getSitemapEntries(
      {},
      makeTenant(),
      ["sv", "en", "de"],
    );
    for (const entry of entries) {
      expect(entry.alternates).toHaveLength(3);
    }
  });
});

// ── Lastmod stability (M7 prep) ───────────────────────────────
//
// Pre-M7 the adapter emitted `new Date()` for Seoable
// updatedAt/publishedAt and sitemap lastmod. Fixed to
// `tenant.contentUpdatedAt` — currently proxied to Tenant.updatedAt
// (see SeoTenantContext JSDoc for the post-M7 migration path).

describe("homepageSeoAdapter — lastmod stability", () => {
  it("toSeoable updatedAt/publishedAt === tenant.contentUpdatedAt", () => {
    const tenantTs = new Date("2026-02-20T12:34:56Z");
    const seoable = homepageSeoAdapter.toSeoable(
      {},
      makeTenant({ contentUpdatedAt: tenantTs }),
    );
    expect(seoable.updatedAt.getTime()).toBe(tenantTs.getTime());
    expect(seoable.publishedAt?.getTime()).toBe(tenantTs.getTime());
  });

  it("getSitemapEntries lastmod === tenant.contentUpdatedAt for every locale", () => {
    const tenantTs = new Date("2026-02-20T12:34:56Z");
    const entries = homepageSeoAdapter.getSitemapEntries(
      {},
      makeTenant({ contentUpdatedAt: tenantTs }),
      ["sv", "en", "de"],
    );
    for (const entry of entries) {
      expect(entry.lastmod?.getTime()).toBe(tenantTs.getTime());
    }
  });

  it("toSeoable is deterministic across two calls with identical input", () => {
    const tenant = makeTenant();
    const a = homepageSeoAdapter.toSeoable({}, tenant);
    const b = homepageSeoAdapter.toSeoable({}, tenant);
    expect(a.updatedAt.getTime()).toBe(b.updatedAt.getTime());
    expect(a.publishedAt?.getTime()).toBe(b.publishedAt?.getTime());
  });

  it("getSitemapEntries is deterministic across two calls with identical input", () => {
    const tenant = makeTenant();
    const a = homepageSeoAdapter.getSitemapEntries({}, tenant, ["sv"]);
    const b = homepageSeoAdapter.getSitemapEntries({}, tenant, ["sv"]);
    expect(a[0].lastmod?.getTime()).toBe(b[0].lastmod?.getTime());
  });
});
