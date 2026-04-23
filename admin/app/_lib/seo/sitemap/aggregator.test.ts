import { describe, expect, it, vi } from "vitest";

import type { SeoTenantContext } from "../types";
import {
  SitemapAggregationError,
  buildShardForTenant,
  buildSitemapIndexForTenant,
} from "./aggregator";
import {
  type BuiltShardEntry,
  type ShardRegistry,
  type SitemapResourceType,
  type SitemapShardFetcher,
  SHARD_SIZE,
  SITEMAP_RESOURCE_TYPES,
} from "./types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(overrides: Partial<SeoTenantContext> = {}): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function makeEntry(
  url: string,
  lastmod: Date | null = new Date("2026-04-01T00:00:00Z"),
): BuiltShardEntry {
  return {
    url,
    lastmod,
    alternates: [{ hreflang: "sv", url }],
  };
}

/**
 * Build a mock registry where every resource type uses the same
 * fetcher. Override per-type via `overrides`.
 */
function makeRegistry(
  defaultFetcher: SitemapShardFetcher,
  overrides: Partial<ShardRegistry> = {},
): ShardRegistry {
  return {
    accommodations: defaultFetcher,
    accommodation_categories: defaultFetcher,
    products: defaultFetcher,
    product_collections: defaultFetcher,
    pages: defaultFetcher,
    ...overrides,
  };
}

/**
 * Fetcher that simulates a table of `totalRows` rows. Honors offset
 * + limit and produces stable entries. Avoids allocating the full
 * 50k array when only a slice is needed.
 */
function sizedFetcher(
  totalRows: number,
  urlPrefix = "https://apelviken.rutgr.com/x/",
): SitemapShardFetcher {
  return async ({ limit, offset }) => {
    const remaining = Math.max(0, totalRows - offset);
    const count = Math.min(limit, remaining);
    return Array.from({ length: count }, (_, i) =>
      makeEntry(`${urlPrefix}${offset + i}`),
    );
  };
}

// ── Happy path + declared order ──────────────────────────────

describe("buildSitemapIndexForTenant — happy path", () => {
  it("emits one shard ref per resource type when each has entries", async () => {
    const fetcher = vi.fn<SitemapShardFetcher>(async () => [
      makeEntry("https://apelviken.rutgr.com/a"),
    ]);
    const index = await buildSitemapIndexForTenant(
      makeTenant(),
      makeRegistry(fetcher),
    );
    expect(index.shards).toHaveLength(SITEMAP_RESOURCE_TYPES.length);
    // 5 calls, one per type.
    expect(fetcher).toHaveBeenCalledTimes(SITEMAP_RESOURCE_TYPES.length);
  });

  it("emits shards in SITEMAP_RESOURCE_TYPES declared order", async () => {
    const index = await buildSitemapIndexForTenant(
      makeTenant(),
      makeRegistry(async () => [
        makeEntry("https://apelviken.rutgr.com/a"),
      ]),
    );
    expect(index.shards.map((s) => s.resourceType)).toEqual([
      "accommodations",
      "accommodation_categories",
      "products",
      "product_collections",
      "pages",
    ]);
  });

  it("builds shard URLs on the tenant's primaryDomain", async () => {
    const index = await buildSitemapIndexForTenant(
      makeTenant({ primaryDomain: "foo.rutgr.com" }),
      makeRegistry(async () => [
        makeEntry("https://foo.rutgr.com/a"),
      ]),
    );
    for (const ref of index.shards) {
      expect(ref.url).toMatch(
        /^https:\/\/foo\.rutgr\.com\/sitemap_[a-z_]+_\d+\.xml$/,
      );
    }
  });

  it("skips types with zero entries (empty tenant → zero shard refs)", async () => {
    const index = await buildSitemapIndexForTenant(
      makeTenant(),
      makeRegistry(async () => []),
    );
    expect(index.shards).toEqual([]);
  });

  it("only emits non-empty types (mixed: one empty, one full)", async () => {
    const registry = makeRegistry(async () => [], {
      accommodations: async () => [
        makeEntry("https://apelviken.rutgr.com/stays/a"),
      ],
      // everything else: empty
    });
    const index = await buildSitemapIndexForTenant(makeTenant(), registry);
    expect(index.shards.map((s) => s.resourceType)).toEqual([
      "accommodations",
    ]);
  });
});

// ── Tenant isolation ─────────────────────────────────────────

describe("buildSitemapIndexForTenant — tenant isolation", () => {
  it("passes the requested tenant to every fetcher; never a different tenant", async () => {
    const seen: string[] = [];
    const fetcher: SitemapShardFetcher = async ({ tenant }) => {
      seen.push(tenant.id);
      return [];
    };
    await buildSitemapIndexForTenant(
      makeTenant({ id: "tenant_A" }),
      makeRegistry(fetcher),
    );
    // Every fetcher call saw "tenant_A". SITEMAP_RESOURCE_TYPES.length
    // invocations.
    expect(seen).toEqual(
      Array(SITEMAP_RESOURCE_TYPES.length).fill("tenant_A"),
    );
  });

  it("passes the correct tenant id on buildShardForTenant", async () => {
    let captured: string | null = null;
    const fetcher: SitemapShardFetcher = async ({ tenant }) => {
      captured = tenant.id;
      return [];
    };
    await buildShardForTenant(
      makeTenant({ id: "tenant_X" }),
      "products",
      1,
      makeRegistry(fetcher),
    );
    expect(captured).toBe("tenant_X");
  });
});

// ── Shard walker contract ────────────────────────────────────

describe("buildShardForTenant — range handling", () => {
  it("returns null for shardIndex < 1", async () => {
    const r = makeRegistry(async () => []);
    expect(await buildShardForTenant(makeTenant(), "products", 0, r)).toBeNull();
    expect(await buildShardForTenant(makeTenant(), "products", -1, r)).toBeNull();
  });

  it("returns null for non-integer shardIndex", async () => {
    const r = makeRegistry(async () => []);
    expect(await buildShardForTenant(makeTenant(), "products", 1.5, r)).toBeNull();
    expect(await buildShardForTenant(makeTenant(), "products", NaN, r)).toBeNull();
  });

  it("returns a BuiltShard for shardIndex=1 even with zero entries", async () => {
    // Direct route access to `/sitemap_<type>_1.xml` should serve a
    // valid empty <urlset>; null here would break that path.
    const shard = await buildShardForTenant(
      makeTenant(),
      "products",
      1,
      makeRegistry(async () => []),
    );
    expect(shard).not.toBeNull();
    expect(shard?.entries).toEqual([]);
    expect(shard?.hasMore).toBe(false);
  });

  it("returns null for shardIndex>1 with zero entries (out of range)", async () => {
    const shard = await buildShardForTenant(
      makeTenant(),
      "products",
      2,
      makeRegistry(async () => []),
    );
    expect(shard).toBeNull();
  });

  it("computes offset = (shardIndex - 1) * SHARD_SIZE", async () => {
    let seenOffset = -1;
    const fetcher: SitemapShardFetcher = async ({ offset }) => {
      seenOffset = offset;
      return [];
    };
    await buildShardForTenant(
      makeTenant(),
      "products",
      3,
      makeRegistry(fetcher),
    );
    expect(seenOffset).toBe(2 * SHARD_SIZE);
  });

  it("always requests limit = SHARD_SIZE", async () => {
    let seenLimit = -1;
    const fetcher: SitemapShardFetcher = async ({ limit }) => {
      seenLimit = limit;
      return [];
    };
    await buildShardForTenant(
      makeTenant(),
      "products",
      1,
      makeRegistry(fetcher),
    );
    expect(seenLimit).toBe(SHARD_SIZE);
  });
});

// ── Sharding math ────────────────────────────────────────────

describe("buildSitemapIndexForTenant — sharding math", () => {
  it("hasMore=true when fetcher returns exactly SHARD_SIZE → probes shard 2", async () => {
    // sizedFetcher(SHARD_SIZE) returns exactly SHARD_SIZE at offset=0
    // and [] at offset=SHARD_SIZE. The index builder probes shard 2,
    // gets back null (out of range), and emits only shard 1.
    const registry = makeRegistry(async () => [], {
      products: sizedFetcher(SHARD_SIZE),
    });
    const index = await buildSitemapIndexForTenant(makeTenant(), registry);
    const productShards = index.shards.filter(
      (s) => s.resourceType === "products",
    );
    expect(productShards).toHaveLength(1);
    expect(productShards[0].shardIndex).toBe(1);
  });

  it("emits shards 1 and 2 when a type spans 2× SHARD_SIZE", async () => {
    const registry = makeRegistry(async () => [], {
      products: sizedFetcher(SHARD_SIZE * 2),
    });
    const index = await buildSitemapIndexForTenant(makeTenant(), registry);
    const productShards = index.shards.filter(
      (s) => s.resourceType === "products",
    );
    expect(productShards.map((s) => s.shardIndex)).toEqual([1, 2]);
  });

  it("emits shard 1 with hasMore=false when type has < SHARD_SIZE entries", async () => {
    const registry = makeRegistry(async () => [], {
      products: sizedFetcher(10),
    });
    const index = await buildSitemapIndexForTenant(makeTenant(), registry);
    const productShards = index.shards.filter(
      (s) => s.resourceType === "products",
    );
    expect(productShards).toHaveLength(1);
  });
});

// ── lastmod aggregation on the index ─────────────────────────

describe("buildSitemapIndexForTenant — lastmod aggregation", () => {
  it("index ref lastmod = MAX across shard entries (skipping nulls)", async () => {
    const A = new Date("2026-03-01T00:00:00Z");
    const B = new Date("2026-04-15T00:00:00Z"); // newest
    const C = new Date("2026-02-01T00:00:00Z");
    const registry = makeRegistry(async () => [], {
      accommodations: async () => [
        makeEntry("https://apelviken.rutgr.com/a", A),
        makeEntry("https://apelviken.rutgr.com/b", B),
        makeEntry("https://apelviken.rutgr.com/c", null),
        makeEntry("https://apelviken.rutgr.com/d", C),
      ],
    });
    const index = await buildSitemapIndexForTenant(makeTenant(), registry);
    expect(index.shards).toHaveLength(1);
    expect(index.shards[0].lastmod?.getTime()).toBe(B.getTime());
  });

  it("index ref lastmod = null when every entry has null lastmod", async () => {
    const registry = makeRegistry(async () => [], {
      pages: async () => [
        makeEntry("https://apelviken.rutgr.com/", null),
        makeEntry("https://apelviken.rutgr.com/stays", null),
      ],
    });
    const index = await buildSitemapIndexForTenant(makeTenant(), registry);
    expect(index.shards).toHaveLength(1);
    expect(index.shards[0].lastmod).toBeNull();
  });
});

// ── Search NOT invoked (by SitemapResourceType exclusion) ───

describe("buildSitemapIndexForTenant — search exclusion", () => {
  it("SITEMAP_RESOURCE_TYPES does NOT include 'search' (structural)", () => {
    const asStrings: readonly string[] = SITEMAP_RESOURCE_TYPES;
    expect(asStrings).not.toContain("search");
  });

  it("aggregator never probes a 'search' fetcher (there isn't one in the registry type)", async () => {
    // Structural check: ShardRegistry is a Record over SitemapResourceType
    // which has no "search" key. The aggregator walks Object.keys via
    // SITEMAP_RESOURCE_TYPES, so the test is to confirm no 'search'
    // key ever appears in the iteration. Using a spy on every other
    // type and asserting the only observed keys are the five canonical.
    const seenTypes: SitemapResourceType[] = [];
    const spy: SitemapShardFetcher = async () => [];
    const registry: ShardRegistry = {
      accommodations: async (args) => {
        seenTypes.push("accommodations");
        return spy(args);
      },
      accommodation_categories: async (args) => {
        seenTypes.push("accommodation_categories");
        return spy(args);
      },
      products: async (args) => {
        seenTypes.push("products");
        return spy(args);
      },
      product_collections: async (args) => {
        seenTypes.push("product_collections");
        return spy(args);
      },
      pages: async (args) => {
        seenTypes.push("pages");
        return spy(args);
      },
    };
    await buildSitemapIndexForTenant(makeTenant(), registry);
    expect(seenTypes.sort()).toEqual([
      "accommodation_categories",
      "accommodations",
      "pages",
      "product_collections",
      "products",
    ]);
  });
});

// ── Error wrapping (ADDITION 2) ─────────────────────────────

describe("SitemapAggregationError — wraps fetcher failures", () => {
  it("buildShardForTenant wraps fetcher errors with full context", async () => {
    const original = new Error("db connection lost");
    const registry = makeRegistry(async () => {
      throw original;
    });

    await expect(
      buildShardForTenant(
        makeTenant({ id: "tenant_err" }),
        "products",
        3,
        registry,
      ),
    ).rejects.toMatchObject({
      name: "SitemapAggregationError",
      resourceType: "products",
      shardIndex: 3,
      tenantId: "tenant_err",
      cause: original,
    });
  });

  it("SitemapAggregationError.message includes resourceType + shardIndex + tenantId", async () => {
    const registry = makeRegistry(async () => {
      throw new Error("fail");
    });
    try {
      await buildShardForTenant(
        makeTenant({ id: "tenant_msg" }),
        "accommodations",
        2,
        registry,
      );
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(SitemapAggregationError);
      const err = e as SitemapAggregationError;
      expect(err.message).toContain("accommodations");
      expect(err.message).toContain("shard 2");
      expect(err.message).toContain("tenant_msg");
    }
  });

  it("buildSitemapIndexForTenant propagates the wrapped error; no partial build returned", async () => {
    // Two types succeed (would be emitted); one type throws mid-walk.
    // The builder must reject — never return `{ shards: [...partial] }`.
    const good: SitemapShardFetcher = async () => [
      makeEntry("https://apelviken.rutgr.com/x"),
    ];
    const boom: SitemapShardFetcher = async () => {
      throw new Error("explode");
    };
    const registry: ShardRegistry = {
      accommodations: good,
      accommodation_categories: good,
      products: boom, // third in SITEMAP_RESOURCE_TYPES order
      product_collections: good,
      pages: good,
    };

    await expect(
      buildSitemapIndexForTenant(makeTenant(), registry),
    ).rejects.toBeInstanceOf(SitemapAggregationError);

    await expect(
      buildSitemapIndexForTenant(makeTenant(), registry),
    ).rejects.toMatchObject({
      resourceType: "products",
      shardIndex: 1,
    });
  });
});
