import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({ log: vi.fn() }));

import type { PageTypeSeoDefault } from "@prisma/client";

import type { SeoAdapter } from "./adapters/base";
import type {
  ImageService,
  PageTypeSeoDefaultRepository,
} from "./dependencies";
import { stubPageTypeSeoDefaultRepository } from "./dependencies";
import { SeoResolver } from "./resolver";
import type {
  ResolvedImage,
  Seoable,
  SeoResolutionContext,
  SeoTenantContext,
} from "./types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken-test.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv"],
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
    description: "En mysig stuga vid havet",
    featuredImageId: null,
    seoOverrides: null,
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    publishedAt: new Date("2026-04-01T00:00:00Z"),
    locale: "sv",
    ...overrides,
  };
}

function makeCtx(
  overrides: Partial<SeoResolutionContext> = {},
): SeoResolutionContext {
  return {
    tenant: makeTenant(),
    resourceType: "accommodation",
    entity: {},
    locale: "sv",
    ...overrides,
  };
}

function makeTypeDefaults(
  overrides: Partial<PageTypeSeoDefault> = {},
): PageTypeSeoDefault {
  return {
    id: "ptd_1",
    tenantId: "tenant_test",
    pageType: "ACCOMMODATION",
    titlePattern: null,
    descriptionPattern: null,
    ogImagePattern: null,
    structuredDataEnabled: true,
    ...overrides,
  };
}

/** Sync stub ImageService — every call returns null, no throws. */
function makeNoopImageService(): ImageService {
  return {
    async getOgImage() {
      return null;
    },
    async generateDynamicOgImage() {
      return null;
    },
  };
}

function makeFakeAdapter(
  overrides: Partial<SeoAdapter> = {},
): SeoAdapter {
  const base: SeoAdapter = {
    resourceType: "accommodation",
    toSeoable: () => {
      throw new Error("test fixture: toSeoable not used");
    },
    toStructuredData: () => [],
    isIndexable: () => true,
    getSitemapEntries: () => [],
  };
  return { ...base, ...overrides };
}

function newResolver(
  imageService: ImageService = makeNoopImageService(),
  repo: PageTypeSeoDefaultRepository = stubPageTypeSeoDefaultRepository,
): SeoResolver {
  return new SeoResolver(imageService, repo);
}

// ── resolveTitle (unchanged from M2 — regression suite) ──────

describe("SeoResolver.resolveTitle", () => {
  it("entity override wins over type pattern and tenant template", () => {
    const resolver = newResolver();
    const seoable = makeSeoable({
      seoOverrides: {
        title: "Override!",
        noindex: false,
        nofollow: false,
      },
    });
    const typeDefaults = makeTypeDefaults({
      titlePattern: "{entity.title} — pattern",
    });
    expect(resolver.resolveTitle(seoable, typeDefaults, makeCtx())).toBe(
      "Override!",
    );
  });

  it("type pattern applied when no entity override", () => {
    const resolver = newResolver();
    const typeDefaults = makeTypeDefaults({
      titlePattern: "{entity.title} — pattern",
    });
    expect(
      resolver.resolveTitle(makeSeoable(), typeDefaults, makeCtx()),
    ).toBe("Stuga 1 — pattern");
  });

  it("tenant template applied when no override and no pattern", () => {
    const resolver = newResolver();
    expect(resolver.resolveTitle(makeSeoable(), null, makeCtx())).toBe(
      "Stuga 1 | Apelviken",
    );
  });

  it("appends ' – Page N' when pagination.page > 1", () => {
    const resolver = newResolver();
    const ctx = makeCtx({ pagination: { page: 3, totalPages: 7 } });
    expect(resolver.resolveTitle(makeSeoable(), null, ctx)).toBe(
      "Stuga 1 | Apelviken – Page 3",
    );
  });

  it("does NOT append pagination suffix when page === 1", () => {
    const resolver = newResolver();
    const ctx = makeCtx({ pagination: { page: 1, totalPages: 5 } });
    expect(resolver.resolveTitle(makeSeoable(), null, ctx)).toBe(
      "Stuga 1 | Apelviken",
    );
  });

  it("appends tag suffix when tags non-empty", () => {
    const resolver = newResolver();
    const ctx = makeCtx({ tags: ["sommar", "ledig"] });
    expect(resolver.resolveTitle(makeSeoable(), null, ctx)).toBe(
      'Stuga 1 | Apelviken – tagged "sommar, ledig"',
    );
  });

  it("searchQuery replaces the title entirely and ignores pagination/tags", () => {
    const resolver = newResolver();
    const ctx = makeCtx({
      searchQuery: "stuga",
      pagination: { page: 2, totalPages: 10 },
      tags: ["sommar"],
    });
    expect(resolver.resolveTitle(makeSeoable(), null, ctx)).toBe(
      'Search results for "stuga" | Apelviken',
    );
  });
});

// ── resolveDescription (unchanged from M2) ───────────────────

describe("SeoResolver.resolveDescription", () => {
  it("override wins over every other fallback", () => {
    const resolver = newResolver();
    const seoable = makeSeoable({
      seoOverrides: { description: "OV", noindex: false, nofollow: false },
    });
    const typeDefaults = makeTypeDefaults({
      descriptionPattern: "pattern wins — {entity.title}",
    });
    expect(
      resolver.resolveDescription(seoable, typeDefaults, makeCtx()),
    ).toBe("OV");
  });

  it("type pattern wins when no override", () => {
    const resolver = newResolver();
    const typeDefaults = makeTypeDefaults({
      descriptionPattern: "P: {entity.title}",
    });
    expect(
      resolver.resolveDescription(makeSeoable(), typeDefaults, makeCtx()),
    ).toBe("P: Stuga 1");
  });

  it("seoable.description used when no override and no pattern", () => {
    const resolver = newResolver();
    expect(
      resolver.resolveDescription(makeSeoable(), null, makeCtx()),
    ).toBe("En mysig stuga vid havet");
  });

  it("tenant default used when entity description is null", () => {
    const resolver = newResolver();
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        descriptionDefault: "Tenant default",
      },
    });
    const seoable = makeSeoable({ description: null });
    expect(
      resolver.resolveDescription(seoable, null, makeCtx({ tenant })),
    ).toBe("Tenant default");
  });

  it("returns null when every fallback is empty", () => {
    const resolver = newResolver();
    const tenant = makeTenant({ seoDefaults: { titleTemplate: "x" } });
    const seoable = makeSeoable({ description: null });
    expect(
      resolver.resolveDescription(seoable, null, makeCtx({ tenant })),
    ).toBeNull();
  });

  it("truncates at 500 chars with ellipsis when longer", () => {
    const resolver = newResolver();
    const long = "x".repeat(600);
    const result = resolver.resolveDescription(
      makeSeoable({ description: long }),
      null,
      makeCtx(),
    );
    expect(result?.length).toBe(500);
    expect(result?.endsWith("...")).toBe(true);
  });

  it("passes through unchanged at exactly 500 chars", () => {
    const resolver = newResolver();
    const exact = "x".repeat(500);
    expect(
      resolver.resolveDescription(
        makeSeoable({ description: exact }),
        null,
        makeCtx(),
      ),
    ).toBe(exact);
  });
});

// ── resolveCanonical ─────────────────────────────────────────

describe("SeoResolver.resolveCanonical", () => {
  it("default locale → bare path; absolute uses primaryDomain", () => {
    const resolver = newResolver();
    const r = resolver.resolveCanonical(makeSeoable(), makeCtx());
    expect(r.relative).toBe("/accommodations/stuga-1");
    expect(r.absolute).toBe(
      "https://apelviken-test.rutgr.com/accommodations/stuga-1",
    );
  });

  it("non-default locale is prefixed; each locale is self-canonical", () => {
    const resolver = newResolver();
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const r = resolver.resolveCanonical(
      makeSeoable(),
      makeCtx({ tenant, locale: "en" }),
    );
    expect(r.relative).toBe("/en/accommodations/stuga-1");
    expect(r.absolute).toBe(
      "https://apelviken-test.rutgr.com/en/accommodations/stuga-1",
    );
  });

  it("merchant override wins and is used verbatim (no locale prefixing)", () => {
    const resolver = newResolver();
    const seoable = makeSeoable({
      seoOverrides: {
        canonicalPath: "/my-canonical",
        noindex: false,
        nofollow: false,
      },
    });
    const r = resolver.resolveCanonical(seoable, makeCtx({ locale: "en" }));
    expect(r.relative).toBe("/my-canonical");
    expect(r.absolute).toBe("https://apelviken-test.rutgr.com/my-canonical");
  });
});

// ── resolveNoindex ───────────────────────────────────────────

describe("SeoResolver.resolveNoindex", () => {
  it("returns true when override.noindex === true (even if adapter says indexable)", () => {
    const resolver = newResolver();
    const seoable = makeSeoable({
      seoOverrides: { noindex: true, nofollow: false },
    });
    const adapter = makeFakeAdapter({ isIndexable: () => true });
    expect(resolver.resolveNoindex(seoable, adapter, makeCtx())).toBe(true);
  });

  it("defers to adapter.isIndexable(entity) when no override", () => {
    const resolver = newResolver();

    const indexable = makeFakeAdapter({ isIndexable: () => true });
    const notIndexable = makeFakeAdapter({ isIndexable: () => false });

    expect(resolver.resolveNoindex(makeSeoable(), indexable, makeCtx())).toBe(
      false,
    );
    expect(
      resolver.resolveNoindex(makeSeoable(), notIndexable, makeCtx()),
    ).toBe(true);
  });

  it("passes ctx.entity to adapter.isIndexable (not the Seoable)", () => {
    const resolver = newResolver();
    const calls: unknown[] = [];
    const adapter = makeFakeAdapter({
      isIndexable: (e) => {
        calls.push(e);
        return true;
      },
    });
    const ctx = makeCtx({ entity: { marker: "raw-entity" } });
    resolver.resolveNoindex(makeSeoable(), adapter, ctx);
    expect(calls).toEqual([{ marker: "raw-entity" }]);
  });
});

// ── resolveOgImage ───────────────────────────────────────────

describe("SeoResolver.resolveOgImage (fallback chain)", () => {
  const overrideImage: ResolvedImage = {
    url: "https://cdn/x-override.jpg",
    width: 1200,
    height: 630,
    alt: "override",
  };
  const adapterImage: ResolvedImage = {
    url: "https://cdn/x-adapter.jpg",
    width: 1200,
    height: 630,
    alt: "adapter",
  };
  const featuredImage: ResolvedImage = {
    url: "https://cdn/x-featured.jpg",
    width: 1200,
    height: 630,
    alt: "featured",
  };
  const tenantDefaultImage: ResolvedImage = {
    url: "https://cdn/x-tenant.jpg",
    width: 1200,
    height: 630,
    alt: "tenant",
  };
  const dynamicImage: ResolvedImage = {
    url: "https://cdn/x-dynamic.jpg",
    width: 1200,
    height: 630,
    alt: "dynamic",
  };

  it("override wins over everything else", async () => {
    const svc: ImageService = {
      async getOgImage(id) {
        if (id === "override-id") return overrideImage;
        return null;
      },
      async generateDynamicOgImage() {
        return dynamicImage;
      },
    };
    const resolver = newResolver(svc);
    const seoable = makeSeoable({
      seoOverrides: { ogImageId: "override-id", noindex: false, nofollow: false },
      featuredImageId: "feat",
    });
    const adapter = makeFakeAdapter({ getAdapterOgImage: () => adapterImage });
    const r = await resolver.resolveOgImage(seoable, adapter, makeCtx());
    expect(r).toBe(overrideImage);
  });

  it("falls through to adapter.getAdapterOgImage when override missing in ImageService", async () => {
    const svc: ImageService = {
      async getOgImage() {
        return null;
      },
      async generateDynamicOgImage() {
        return dynamicImage;
      },
    };
    const resolver = newResolver(svc);
    const seoable = makeSeoable({
      seoOverrides: { ogImageId: "missing", noindex: false, nofollow: false },
    });
    const adapter = makeFakeAdapter({ getAdapterOgImage: () => adapterImage });
    const r = await resolver.resolveOgImage(seoable, adapter, makeCtx());
    expect(r).toBe(adapterImage);
  });

  it("uses featuredImage when no override and no adapter hook", async () => {
    const svc: ImageService = {
      async getOgImage(id) {
        return id === "feat" ? featuredImage : null;
      },
      async generateDynamicOgImage() {
        return dynamicImage;
      },
    };
    const resolver = newResolver(svc);
    const seoable = makeSeoable({ featuredImageId: "feat" });
    const r = await resolver.resolveOgImage(
      seoable,
      makeFakeAdapter(),
      makeCtx(),
    );
    expect(r).toBe(featuredImage);
  });

  it("uses tenant default when no override / adapter / featured", async () => {
    const svc: ImageService = {
      async getOgImage(id) {
        return id === "tenant-default" ? tenantDefaultImage : null;
      },
      async generateDynamicOgImage() {
        return dynamicImage;
      },
    };
    const resolver = newResolver(svc);
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "{entityTitle} | {siteName}",
        ogImageId: "tenant-default",
      },
    });
    const r = await resolver.resolveOgImage(
      makeSeoable(),
      makeFakeAdapter(),
      makeCtx({ tenant }),
    );
    expect(r).toBe(tenantDefaultImage);
  });

  it("reaches the dynamic OG generator as the final step", async () => {
    const svc: ImageService = {
      async getOgImage() {
        return null;
      },
      async generateDynamicOgImage() {
        return dynamicImage;
      },
    };
    const resolver = newResolver(svc);
    const r = await resolver.resolveOgImage(
      makeSeoable(),
      makeFakeAdapter(),
      makeCtx(),
    );
    expect(r).toBe(dynamicImage);
  });

  it("resolves to null when every fallback rung returns null", async () => {
    const svc = makeNoopImageService();
    const resolver = newResolver(svc);
    const r = await resolver.resolveOgImage(
      makeSeoable(),
      makeFakeAdapter(),
      makeCtx(),
    );
    expect(r).toBeNull();
  });

  it("passes tenantId (from seoable.tenantId) and alt override to ImageService", async () => {
    const calls: Array<{ id: string; tenantId: string; alt?: string | null }> =
      [];
    const svc: ImageService = {
      async getOgImage(id, tenantId, options) {
        calls.push({ id, tenantId, alt: options?.alt ?? null });
        return overrideImage;
      },
      async generateDynamicOgImage() {
        return null;
      },
    };
    const resolver = newResolver(svc);
    const seoable = makeSeoable({
      seoOverrides: {
        ogImageId: "overrideId",
        ogImageAlt: "Specific alt",
        noindex: false,
        nofollow: false,
      },
    });
    await resolver.resolveOgImage(seoable, makeFakeAdapter(), makeCtx());
    expect(calls[0]).toEqual({
      id: "overrideId",
      tenantId: "tenant_test",
      alt: "Specific alt",
    });
  });
});

// ── mergeStructuredData ──────────────────────────────────────

describe("SeoResolver.mergeStructuredData", () => {
  it("includes adapter output when structuredDataEnabled is not explicitly false", () => {
    const resolver = newResolver();
    const adapter = makeFakeAdapter({
      toStructuredData: () => [
        {
          "@context": "https://schema.org",
          "@type": "Accommodation",
          name: "Cabin",
        },
      ],
    });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      adapter,
      null,
      makeCtx(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]["@type"]).toBe("Accommodation");
  });

  it("skips adapter output when structuredDataEnabled === false", () => {
    const resolver = newResolver();
    const adapter = makeFakeAdapter({
      toStructuredData: () => [
        { "@context": "https://schema.org", "@type": "X" },
      ],
    });
    const typeDefaults = makeTypeDefaults({ structuredDataEnabled: false });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      adapter,
      typeDefaults,
      makeCtx(),
    );
    expect(result).toEqual([]);
  });

  it("includes tenant-level Organization on homepage when valid", () => {
    const resolver = newResolver();
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        organizationSchema: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Apelviken AB",
        },
      },
    });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      makeFakeAdapter(),
      null,
      makeCtx({ tenant, resourceType: "homepage" }),
    );
    const org = result.find((o) => o["@type"] === "Organization");
    expect(org).toBeDefined();
  });

  it("does NOT emit tenant-level schemas on non-homepage routes", () => {
    const resolver = newResolver();
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        organizationSchema: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Apelviken AB",
        },
      },
    });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      makeFakeAdapter(),
      null,
      makeCtx({ tenant, resourceType: "accommodation" }),
    );
    expect(result.find((o) => o["@type"] === "Organization")).toBeUndefined();
  });

  it("drops Organization schema when name is missing (no partial JSON-LD)", () => {
    const resolver = newResolver();
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        organizationSchema: {
          "@context": "https://schema.org",
          "@type": "Organization",
          // name missing
        },
      },
    });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      makeFakeAdapter(),
      null,
      makeCtx({ tenant, resourceType: "homepage" }),
    );
    expect(result).toEqual([]);
  });

  it("drops LocalBusiness schema when address.streetAddress is missing", () => {
    const resolver = newResolver();
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        localBusinessSchema: {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Apelviken",
          address: { "@type": "PostalAddress" }, // no streetAddress
        },
      },
    });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      makeFakeAdapter(),
      null,
      makeCtx({ tenant, resourceType: "homepage" }),
    );
    expect(result).toEqual([]);
  });

  it("includes valid LocalBusiness schema on homepage", () => {
    const resolver = newResolver();
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        localBusinessSchema: {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Apelviken",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Strandvägen 1",
          },
        },
      },
    });
    const result = resolver.mergeStructuredData(
      makeSeoable(),
      makeFakeAdapter(),
      null,
      makeCtx({ tenant, resourceType: "homepage" }),
    );
    expect(result.find((o) => o["@type"] === "LocalBusiness")).toBeDefined();
  });

  it("appends merchant-authored structuredDataExtensions when valid", () => {
    const resolver = newResolver();
    const seoable = makeSeoable({
      seoOverrides: {
        noindex: false,
        nofollow: false,
        structuredDataExtensions: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            name: "Extra",
          },
          // Missing @context — should be dropped.
          { "@type": "Invalid", name: "skip" },
        ],
      },
    });
    const result = resolver.mergeStructuredData(
      seoable,
      makeFakeAdapter(),
      null,
      makeCtx(),
    );
    expect(result.find((o) => o["@type"] === "FAQPage")).toBeDefined();
    expect(result.find((o) => o["@type"] === "Invalid")).toBeUndefined();
  });
});
