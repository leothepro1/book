import { describe, expect, it } from "vitest";

import {
  searchPageUrl,
  searchSeoAdapter,
  type SearchSeoInput,
} from "./search";
import { SeoableSchema, type SeoTenantContext } from "../types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en"],
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<SearchSeoInput> = {},
): SearchSeoInput {
  return {
    tenantId: "tenant_test",
    activeLocales: ["sv", "en"],
    ...overrides,
  };
}

// ── toSeoable ────────────────────────────────────────────────

describe("searchSeoAdapter.toSeoable", () => {
  it("synthesizes the canonical search Seoable", () => {
    const seoable = searchSeoAdapter.toSeoable(makeInput(), makeTenant());
    expect(seoable).toMatchObject({
      resourceType: "search",
      id: "search:tenant_test",
      tenantId: "tenant_test",
      path: "/search",
      title: "Sök",
      description: null,
      featuredImageId: null,
      seoOverrides: null,
      locale: "sv",
    });
  });

  it("uses tenant.defaultLocale even across different request locales", () => {
    const seoable = searchSeoAdapter.toSeoable(
      makeInput(),
      makeTenant({ defaultLocale: "en" }),
    );
    expect(seoable.locale).toBe("en");
  });

  it("does NOT synthesize seoOverrides — noindex is signaled via isIndexable instead", () => {
    // Keeping the signal channels distinct: a noindex ENTITY override
    // is a merchant decision; a noindex RESOURCE TYPE is architectural.
    // Search is the second — synthesizing seoOverrides.noindex would
    // muddle the intent.
    const seoable = searchSeoAdapter.toSeoable(makeInput(), makeTenant());
    expect(seoable.seoOverrides).toBeNull();
  });
});

// ── Synthetic id stability ───────────────────────────────────

describe("searchSeoAdapter — synthetic id stability", () => {
  it("produces identical ids across repeat calls (cache() dedup contract)", () => {
    const a = searchSeoAdapter.toSeoable(makeInput(), makeTenant());
    const b = searchSeoAdapter.toSeoable(makeInput(), makeTenant());
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("search:tenant_test");
  });

  it("id does NOT include locale", () => {
    const a = searchSeoAdapter.toSeoable(
      makeInput(),
      makeTenant({ defaultLocale: "sv" }),
    );
    const b = searchSeoAdapter.toSeoable(
      makeInput(),
      makeTenant({ defaultLocale: "en" }),
    );
    expect(a.id).toBe(b.id);
  });

  it("id includes tenantId so different tenants have different ids", () => {
    const a = searchSeoAdapter.toSeoable(
      makeInput({ tenantId: "tenant_A" }),
      makeTenant({ id: "tenant_A" }),
    );
    const b = searchSeoAdapter.toSeoable(
      makeInput({ tenantId: "tenant_B" }),
      makeTenant({ id: "tenant_B" }),
    );
    expect(a.id).not.toBe(b.id);
  });
});

// ── Zod output validation ────────────────────────────────────

describe("searchSeoAdapter.toSeoable — Zod output contract", () => {
  it("passes SeoableSchema.safeParse", () => {
    const seoable = searchSeoAdapter.toSeoable(makeInput(), makeTenant());
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });
});

// ── Tenant isolation contract ────────────────────────────────

describe("searchSeoAdapter — tenant isolation contract", () => {
  it("returns a Seoable using input.tenantId even when tenant context disagrees", () => {
    const input = makeInput({ tenantId: "tenant_A" });
    const tenantB = makeTenant({
      id: "tenant_B",
      primaryDomain: "b.rutgr.com",
    });
    const seoable = searchSeoAdapter.toSeoable(input, tenantB);
    expect(seoable.tenantId).toBe("tenant_A");
    expect(seoable.id).toBe("search:tenant_A");
  });
});

// ── isIndexable ──────────────────────────────────────────────

describe("searchSeoAdapter.isIndexable", () => {
  it("always returns false regardless of input", () => {
    expect(searchSeoAdapter.isIndexable(makeInput())).toBe(false);
    expect(
      searchSeoAdapter.isIndexable(
        makeInput({ tenantId: "x", activeLocales: [] }),
      ),
    ).toBe(false);
  });
});

// ── toStructuredData ─────────────────────────────────────────

describe("searchSeoAdapter.toStructuredData", () => {
  it("always returns an empty array (no JSON-LD for search pages per Google guidance)", () => {
    expect(
      searchSeoAdapter.toStructuredData(
        makeInput(),
        makeTenant(),
        "sv",
      ),
    ).toEqual([]);
  });

  it("returns empty even when a logContext is supplied", () => {
    expect(
      searchSeoAdapter.toStructuredData(
        makeInput(),
        makeTenant(),
        "sv",
        { requestId: "req_xyz" },
      ),
    ).toEqual([]);
  });
});

// ── getSitemapEntries ────────────────────────────────────────

describe("searchSeoAdapter.getSitemapEntries", () => {
  it("always returns an empty array — /search never in sitemap", () => {
    const entries = searchSeoAdapter.getSitemapEntries(
      makeInput(),
      makeTenant(),
      ["sv", "en"],
    );
    expect(entries).toEqual([]);
  });

  it("empty regardless of how many locales are passed", () => {
    expect(
      searchSeoAdapter.getSitemapEntries(
        makeInput(),
        makeTenant(),
        ["sv", "en", "de", "no", "dk"],
      ),
    ).toEqual([]);
  });
});

// ── getAdapterOgImage ─────────────────────────────────────────

describe("searchSeoAdapter.getAdapterOgImage", () => {
  it("returns null (resolver falls through to tenant default → dynamic)", () => {
    expect(
      searchSeoAdapter.getAdapterOgImage?.(makeInput(), makeTenant()),
    ).toBeNull();
  });
});

// ── searchPageUrl helper ─────────────────────────────────────

describe("searchPageUrl", () => {
  it("builds the default-locale URL as a bare /search", () => {
    expect(searchPageUrl(makeTenant(), "sv")).toBe(
      "https://apelviken.rutgr.com/search",
    );
  });

  it("prefixes the non-default locale", () => {
    expect(searchPageUrl(makeTenant(), "en")).toBe(
      "https://apelviken.rutgr.com/en/search",
    );
  });
});
