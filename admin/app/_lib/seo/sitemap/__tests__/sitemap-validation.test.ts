/**
 * Tests for the sitemap validator itself.
 *
 * The validator MUST be correct before we trust it to guard other
 * tests. This file:
 *
 *   1. Exercises both schemas (urlset + sitemapindex) with valid
 *      and invalid inputs.
 *   2. Asserts that the production serializer's real output
 *      passes validation (round-trip sanity).
 *
 * Covers sitemap.org 0.9 + Google hreflang xhtml:link extension.
 */

import { describe, expect, it } from "vitest";

import {
  sitemapIndexToXml,
  sitemapShardToXml,
} from "../xml";
import {
  expectValidSitemapIndex,
  expectValidSitemapUrlset,
  SitemapIndexSchema,
  SitemapUrlsetSchema,
  parseSitemapXml,
} from "./sitemap-validation";

// ── Minimal valid fixtures ──────────────────────────────────

const MINIMAL_EMPTY_URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
</urlset>`;

const MINIMAL_SINGLE_URL = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/stays/stuga</loc>
    <lastmod>2026-04-01T00:00:00.000Z</lastmod>
    <xhtml:link rel="alternate" hreflang="sv" href="https://apelviken.rutgr.com/stays/stuga"/>
  </url>
</urlset>`;

const MINIMAL_EMPTY_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</sitemapindex>`;

const MINIMAL_SINGLE_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://apelviken.rutgr.com/sitemap_pages_1.xml</loc>
    <lastmod>2026-04-01T00:00:00.000Z</lastmod>
  </sitemap>
</sitemapindex>`;

// ── Urlset schema — positive cases ───────────────────────────

describe("SitemapUrlsetSchema — valid cases", () => {
  it("accepts a minimal empty urlset (0 url elements)", () => {
    expect(() => expectValidSitemapUrlset(MINIMAL_EMPTY_URLSET)).not.toThrow();
  });

  it("accepts a urlset with 1 url entry + hreflang alternate", () => {
    expect(() => expectValidSitemapUrlset(MINIMAL_SINGLE_URL)).not.toThrow();
  });

  it("accepts a urlset with 20 url entries (array coercion holds mid-range)", () => {
    const urls = Array.from({ length: 20 }, (_, i) => `
  <url>
    <loc>https://apelviken.rutgr.com/stays/stuga-${i}</loc>
  </url>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).not.toThrow();
  });

  it("accepts a urlset with 100 url entries (array coercion holds at scale)", () => {
    const urls = Array.from({ length: 100 }, (_, i) => `
  <url>
    <loc>https://apelviken.rutgr.com/stays/stuga-${i}</loc>
  </url>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).not.toThrow();
  });

  it("accepts a url entry with no lastmod (optional field)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).not.toThrow();
  });

  it("accepts multiple hreflang alternates on a single url", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
    <xhtml:link rel="alternate" hreflang="sv" href="https://apelviken.rutgr.com/x"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://apelviken.rutgr.com/en/x"/>
    <xhtml:link rel="alternate" hreflang="de" href="https://apelviken.rutgr.com/de/x"/>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).not.toThrow();
  });
});

// ── Urlset schema — negative cases ──────────────────────────

describe("SitemapUrlsetSchema — invalid cases", () => {
  it("fails when @_xmlns is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when @_xmlns has the wrong literal value", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://example.com/wrong"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when @_xmlns:xhtml is missing (Bedfront always-declare contract)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when a url entry is missing <loc>", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <lastmod>2026-04-01T00:00:00.000Z</lastmod>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when <loc> is not an absolute URL", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>/relative/path</loc>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when <lastmod> is not W3C Datetime", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
    <lastmod>yesterday</lastmod>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when <lastmod> drops millisecond precision (drift detection)", () => {
    // toISOString() always emits .sss. This test enforces that.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
    <lastmod>2026-04-01T00:00:00Z</lastmod>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when <lastmod> carries a timezone offset instead of Z (drift detection)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
    <lastmod>2026-04-01T00:00:00.000+02:00</lastmod>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when a <url> contains an unknown element (e.g. <priority>)", () => {
    // .strict() catches accidental additions — future maintainers
    // should update the schema, not remove .strict().
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
    <priority>0.8</priority>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("fails when <xhtml:link> has wrong @_rel (must be 'alternate')", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://apelviken.rutgr.com/x</loc>
    <xhtml:link rel="canonical" hreflang="sv" href="https://apelviken.rutgr.com/x"/>
  </url>
</urlset>`;
    expect(() => expectValidSitemapUrlset(xml)).toThrow(/validation failed/);
  });

  it("includes the raw XML in the error message for debuggability", () => {
    const broken = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://WRONG">
</urlset>`;
    try {
      expectValidSitemapUrlset(broken);
      throw new Error("expected throw");
    } catch (e) {
      expect(String(e)).toContain("http://WRONG");
    }
  });
});

// ── Index schema — positive cases ───────────────────────────

describe("SitemapIndexSchema — valid cases", () => {
  it("accepts a minimal empty sitemapindex (0 sitemap entries)", () => {
    // The serializer exercises this case (xml.test.ts). Production
    // never emits it — pages shard is always populated.
    expect(() => expectValidSitemapIndex(MINIMAL_EMPTY_INDEX)).not.toThrow();
  });

  it("accepts a sitemapindex with 1 sitemap entry + lastmod", () => {
    expect(() => expectValidSitemapIndex(MINIMAL_SINGLE_INDEX)).not.toThrow();
  });

  it("accepts a sitemap entry without lastmod (optional)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://apelviken.rutgr.com/sitemap_pages_1.xml</loc>
  </sitemap>
</sitemapindex>`;
    expect(() => expectValidSitemapIndex(xml)).not.toThrow();
  });

  it("accepts a sitemapindex with 5 sitemap entries (one per resource type)", () => {
    const entries = [
      "accommodations",
      "accommodation_categories",
      "products",
      "product_collections",
      "pages",
    ]
      .map(
        (t) => `
  <sitemap>
    <loc>https://apelviken.rutgr.com/sitemap_${t}_1.xml</loc>
  </sitemap>`,
      )
      .join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</sitemapindex>`;
    expect(() => expectValidSitemapIndex(xml)).not.toThrow();
  });
});

// ── Index schema — negative cases ───────────────────────────

describe("SitemapIndexSchema — invalid cases", () => {
  it("fails when @_xmlns is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex>
</sitemapindex>`;
    expect(() => expectValidSitemapIndex(xml)).toThrow(/validation failed/);
  });

  it("fails when a <sitemap> entry is missing <loc>", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <lastmod>2026-04-01T00:00:00.000Z</lastmod>
  </sitemap>
</sitemapindex>`;
    expect(() => expectValidSitemapIndex(xml)).toThrow(/validation failed/);
  });

  it("fails when a <sitemap> entry has an unknown element", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://apelviken.rutgr.com/sitemap_x_1.xml</loc>
    <priority>0.8</priority>
  </sitemap>
</sitemapindex>`;
    expect(() => expectValidSitemapIndex(xml)).toThrow(/validation failed/);
  });
});

// ── Round-trip with production serializer ──────────────────

describe("Round-trip — real serializer output passes validation", () => {
  it("sitemapIndexToXml on a realistic BuiltSitemapIndex", () => {
    const xml = sitemapIndexToXml({
      shards: [
        {
          resourceType: "pages",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_pages_1.xml",
          lastmod: new Date("2026-04-10T00:00:00Z"),
        },
        {
          resourceType: "accommodations",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_accommodations_1.xml",
          lastmod: null,
        },
      ],
    });
    expect(() => expectValidSitemapIndex(xml)).not.toThrow();
  });

  it("sitemapShardToXml on a realistic BuiltShard with alternates", () => {
    const xml = sitemapShardToXml({
      resourceType: "accommodations",
      shardIndex: 1,
      entries: [
        {
          url: "https://apelviken.rutgr.com/stays/stuga-bjork",
          lastmod: new Date("2026-04-01T00:00:00Z"),
          alternates: [
            { hreflang: "sv", url: "https://apelviken.rutgr.com/stays/stuga-bjork" },
            { hreflang: "en", url: "https://apelviken.rutgr.com/en/stays/stuga-bjork" },
          ],
        },
      ],
      hasMore: false,
    });
    expect(() => expectValidSitemapUrlset(xml)).not.toThrow();
  });

  it("sitemapShardToXml on an empty BuiltShard", () => {
    const xml = sitemapShardToXml({
      resourceType: "products",
      shardIndex: 1,
      entries: [],
      hasMore: false,
    });
    expect(() => expectValidSitemapUrlset(xml)).not.toThrow();
  });
});

// ── Parser + schema identity ────────────────────────────────

describe("parseSitemapXml — structural sanity", () => {
  it("returns an object with the expected top-level key for urlset", () => {
    const parsed = parseSitemapXml(MINIMAL_SINGLE_URL) as { urlset: unknown };
    expect(parsed.urlset).toBeDefined();
  });

  it("returns an object with the expected top-level key for sitemapindex", () => {
    const parsed = parseSitemapXml(MINIMAL_SINGLE_INDEX) as {
      sitemapindex: unknown;
    };
    expect(parsed.sitemapindex).toBeDefined();
  });

  it("SitemapUrlsetSchema + SitemapIndexSchema are exported Zod types", () => {
    expect(typeof SitemapUrlsetSchema.safeParse).toBe("function");
    expect(typeof SitemapIndexSchema.safeParse).toBe("function");
  });
});
