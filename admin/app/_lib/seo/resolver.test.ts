import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/logger", () => ({
  log: vi.fn(),
}));

import type { PageTypeSeoDefault } from "@prisma/client";

import type { SeoAdapter } from "./adapters/base";
import {
  stubImageService,
  stubPageTypeSeoDefaultRepository,
} from "./dependencies";
import { SeoResolver } from "./resolver";
import type {
  Seoable,
  SeoResolutionContext,
  SeoTenantContext,
} from "./types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(overrides: Partial<SeoTenantContext> = {}): SeoTenantContext {
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

function makeCtx(overrides: Partial<SeoResolutionContext> = {}): SeoResolutionContext {
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

function makeFakeAdapter(): SeoAdapter {
  return {
    resourceType: "accommodation",
    toSeoable: () => {
      throw new Error("test fixture: toSeoable not used");
    },
    toStructuredData: () => [],
    isIndexable: () => true,
    getSitemapEntries: () => [],
  };
}

function newResolver(): SeoResolver {
  return new SeoResolver(stubImageService, stubPageTypeSeoDefaultRepository);
}

// ── resolveTitle ──────────────────────────────────────────────

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

  it("does NOT append tag suffix when tags is empty array", () => {
    const resolver = newResolver();
    expect(
      resolver.resolveTitle(makeSeoable(), null, makeCtx({ tags: [] })),
    ).toBe("Stuga 1 | Apelviken");
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

  it("interpolation fallback: uses literal placeholder when key missing", () => {
    const resolver = newResolver();
    const typeDefaults = makeTypeDefaults({
      titlePattern: "{entity.nonexistent} — fallback",
    });
    // Missing key is preserved literally, per interpolation spec.
    expect(
      resolver.resolveTitle(makeSeoable(), typeDefaults, makeCtx()),
    ).toBe("{entity.nonexistent} — fallback");
  });
});

// ── resolveDescription ────────────────────────────────────────

describe("SeoResolver.resolveDescription", () => {
  it("override wins over every other fallback", () => {
    const resolver = newResolver();
    const seoable = makeSeoable({
      seoOverrides: {
        description: "OV",
        noindex: false,
        nofollow: false,
      },
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
    const tenant = makeTenant({
      seoDefaults: { titleTemplate: "x" },
    });
    const seoable = makeSeoable({ description: null });
    expect(
      resolver.resolveDescription(seoable, null, makeCtx({ tenant })),
    ).toBeNull();
  });

  it("truncates at 500 chars with ellipsis when input is longer", () => {
    const resolver = newResolver();
    const long = "x".repeat(600);
    const result = resolver.resolveDescription(
      makeSeoable({ description: long }),
      null,
      makeCtx(),
    );
    expect(result).not.toBeNull();
    expect(result?.length).toBe(500);
    expect(result?.endsWith("...")).toBe(true);
    expect(result?.slice(0, 497)).toBe("x".repeat(497));
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

// ── Stubbed methods ───────────────────────────────────────────

describe("SeoResolver — methods stubbed in M2", () => {
  it("resolve() rejects with 'Not implemented in M2'", async () => {
    await expect(newResolver().resolve(makeCtx())).rejects.toThrow(
      /Not implemented in M2/,
    );
  });

  it("resolveOgImage() rejects with 'Not implemented in M2'", async () => {
    await expect(
      newResolver().resolveOgImage(makeSeoable(), makeFakeAdapter(), makeCtx()),
    ).rejects.toThrow(/Not implemented in M2/);
  });

  it("resolveCanonical() throws 'Not implemented in M2'", () => {
    expect(() =>
      newResolver().resolveCanonical(makeSeoable(), makeCtx()),
    ).toThrow(/Not implemented in M2/);
  });

  it("resolveNoindex() throws 'Not implemented in M2'", () => {
    expect(() =>
      newResolver().resolveNoindex(makeSeoable(), makeFakeAdapter()),
    ).toThrow(/Not implemented in M2/);
  });

  it("mergeStructuredData() throws 'Not implemented in M2'", () => {
    expect(() =>
      newResolver().mergeStructuredData(
        makeSeoable(),
        makeFakeAdapter(),
        null,
        makeCtx(),
      ),
    ).toThrow(/Not implemented in M2/);
  });
});
