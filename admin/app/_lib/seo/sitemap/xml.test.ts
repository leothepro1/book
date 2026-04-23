import { describe, expect, it } from "vitest";

import {
  sitemapIndexToXml as _sitemapIndexToXmlRaw,
  sitemapShardToXml as _sitemapShardToXmlRaw,
  xmlEscape,
} from "./xml";
import type { BuiltShard, BuiltSitemapIndex } from "./types";
import {
  expectValidSitemapIndex,
  expectValidSitemapUrlset,
} from "./__tests__/sitemap-validation";

// ── Validating serializer wrappers ───────────────────────────
//
// Every serializer output in this file is automatically piped
// through the M7.5 structural validator (sitemap-validation.ts).
// Schema drift anywhere in the hand-rolled `xml.ts` surfaces here
// before it ships. The original assertions (substring checks +
// `.not.toContain()` guards) stay — they catch specific contract
// choices (e.g. "lastmod tag omitted when null"), while the
// validator wrapper catches structural conformance.

function sitemapIndexToXml(index: BuiltSitemapIndex): string {
  const xml = _sitemapIndexToXmlRaw(index);
  expectValidSitemapIndex(xml);
  return xml;
}

function sitemapShardToXml(shard: BuiltShard): string {
  const xml = _sitemapShardToXmlRaw(shard);
  expectValidSitemapUrlset(xml);
  return xml;
}

// ── xmlEscape ────────────────────────────────────────────────

describe("xmlEscape", () => {
  it("returns an empty string unchanged", () => {
    expect(xmlEscape("")).toBe("");
  });

  it("returns a no-special-char string unchanged", () => {
    expect(xmlEscape("https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("escapes '&' to '&amp;'", () => {
    expect(xmlEscape("a & b")).toBe("a &amp; b");
  });

  it("escapes '<' to '&lt;'", () => {
    expect(xmlEscape("a < b")).toBe("a &lt; b");
  });

  it("escapes '>' to '&gt;'", () => {
    expect(xmlEscape("a > b")).toBe("a &gt; b");
  });

  it("escapes '\"' to '&quot;'", () => {
    expect(xmlEscape('a "b" c')).toBe("a &quot;b&quot; c");
  });

  it("escapes \"'\" to '&apos;'", () => {
    expect(xmlEscape("it's")).toBe("it&apos;s");
  });

  it("escapes '&' FIRST (order matters — no double-escaping)", () => {
    // If `<` were replaced before `&`, the result would be `&amp;lt;`.
    // The correct output is `&amp;&lt;` — each original char escaped once.
    expect(xmlEscape("&<")).toBe("&amp;&lt;");
  });

  it("escapes all five predefined entities in one string", () => {
    expect(xmlEscape(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("escapes a realistic URL with query + ampersand", () => {
    expect(
      xmlEscape("https://apelviken.rutgr.com/search?q=stuga&page=2"),
    ).toBe("https://apelviken.rutgr.com/search?q=stuga&amp;page=2");
  });
});

// ── sitemapIndexToXml ───────────────────────────────────────

describe("sitemapIndexToXml", () => {
  it("emits a valid empty sitemapindex when shards is empty", () => {
    const xml = sitemapIndexToXml({ shards: [] });
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    );
    expect(xml).toContain(`</sitemapindex>`);
    expect(xml).not.toContain(`<sitemap>`);
  });

  it("emits a single shard ref with lastmod", () => {
    const xml = sitemapIndexToXml({
      shards: [
        {
          resourceType: "accommodations",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_accommodations_1.xml",
          lastmod: new Date("2026-04-10T12:00:00Z"),
        },
      ],
    });
    expect(xml).toContain(
      `<loc>https://apelviken.rutgr.com/sitemap_accommodations_1.xml</loc>`,
    );
    expect(xml).toContain(`<lastmod>2026-04-10T12:00:00.000Z</lastmod>`);
  });

  it("omits the <lastmod> tag when shard.lastmod is null", () => {
    const xml = sitemapIndexToXml({
      shards: [
        {
          resourceType: "pages",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_pages_1.xml",
          lastmod: null,
        },
      ],
    });
    expect(xml).toContain(`<loc>`);
    expect(xml).not.toContain(`<lastmod>`);
  });

  it("emits multiple shard refs across resource types", () => {
    const xml = sitemapIndexToXml({
      shards: [
        {
          resourceType: "accommodations",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_accommodations_1.xml",
          lastmod: new Date("2026-04-10T00:00:00Z"),
        },
        {
          resourceType: "products",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_products_1.xml",
          lastmod: new Date("2026-04-11T00:00:00Z"),
        },
        {
          resourceType: "pages",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_pages_1.xml",
          lastmod: null,
        },
      ],
    });
    expect(xml).toContain(`sitemap_accommodations_1.xml`);
    expect(xml).toContain(`sitemap_products_1.xml`);
    expect(xml).toContain(`sitemap_pages_1.xml`);
    // Three <sitemap> wrappers.
    expect(xml.match(/<sitemap>/g)?.length).toBe(3);
  });

  it("xml-escapes URLs containing '&'", () => {
    const xml = sitemapIndexToXml({
      shards: [
        {
          resourceType: "pages",
          shardIndex: 1,
          url: "https://apelviken.rutgr.com/sitemap_pages_1.xml?x=1&y=2",
          lastmod: null,
        },
      ],
    });
    expect(xml).toContain(
      `<loc>https://apelviken.rutgr.com/sitemap_pages_1.xml?x=1&amp;y=2</loc>`,
    );
  });
});

// ── sitemapShardToXml ───────────────────────────────────────

function makeShard(overrides: Partial<BuiltShard> = {}): BuiltShard {
  return {
    resourceType: "accommodations",
    shardIndex: 1,
    entries: [],
    hasMore: false,
    ...overrides,
  };
}

describe("sitemapShardToXml", () => {
  it("emits an empty <urlset> when entries is empty", () => {
    const xml = sitemapShardToXml(makeShard());
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(`<urlset`);
    expect(xml).toContain(
      `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
    );
    expect(xml).toContain(`xmlns:xhtml="http://www.w3.org/1999/xhtml"`);
    expect(xml).toContain(`</urlset>`);
    expect(xml).not.toContain(`<url>`);
  });

  it("emits a url with no alternates", () => {
    const xml = sitemapShardToXml(
      makeShard({
        entries: [
          {
            url: "https://apelviken.rutgr.com/stays/stuga-bjork",
            lastmod: new Date("2026-04-01T00:00:00Z"),
            alternates: [],
          },
        ],
      }),
    );
    expect(xml).toContain(
      `<loc>https://apelviken.rutgr.com/stays/stuga-bjork</loc>`,
    );
    expect(xml).toContain(`<lastmod>2026-04-01T00:00:00.000Z</lastmod>`);
    expect(xml).not.toContain(`<xhtml:link`);
  });

  it("emits a url with sv/en/de hreflang alternates", () => {
    const xml = sitemapShardToXml(
      makeShard({
        entries: [
          {
            url: "https://apelviken.rutgr.com/stays/stuga",
            lastmod: new Date("2026-04-01T00:00:00Z"),
            alternates: [
              {
                hreflang: "sv",
                url: "https://apelviken.rutgr.com/stays/stuga",
              },
              {
                hreflang: "en",
                url: "https://apelviken.rutgr.com/en/stays/stuga",
              },
              {
                hreflang: "de",
                url: "https://apelviken.rutgr.com/de/stays/stuga",
              },
            ],
          },
        ],
      }),
    );
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="sv" href="https://apelviken.rutgr.com/stays/stuga"/>`,
    );
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="https://apelviken.rutgr.com/en/stays/stuga"/>`,
    );
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="de" href="https://apelviken.rutgr.com/de/stays/stuga"/>`,
    );
  });

  it("omits <lastmod> on null entries but emits it on real Date entries in the same shard", () => {
    const xml = sitemapShardToXml(
      makeShard({
        entries: [
          {
            url: "https://apelviken.rutgr.com/a",
            lastmod: null,
            alternates: [],
          },
          {
            url: "https://apelviken.rutgr.com/b",
            lastmod: new Date("2026-04-01T00:00:00Z"),
            alternates: [],
          },
        ],
      }),
    );
    // Real Date entry emits <lastmod>; null entry does not.
    expect(xml.match(/<lastmod>/g)?.length).toBe(1);
    expect(xml).toContain(`<lastmod>2026-04-01T00:00:00.000Z</lastmod>`);
  });

  it("xml-escapes URLs and alternate URLs with special characters", () => {
    const xml = sitemapShardToXml(
      makeShard({
        entries: [
          {
            url: "https://apelviken.rutgr.com/page?x=a&y=b",
            lastmod: null,
            alternates: [
              {
                hreflang: "en",
                url: "https://apelviken.rutgr.com/en/page?x=a&y=b",
              },
            ],
          },
        ],
      }),
    );
    expect(xml).toContain(
      `<loc>https://apelviken.rutgr.com/page?x=a&amp;y=b</loc>`,
    );
    expect(xml).toContain(
      `href="https://apelviken.rutgr.com/en/page?x=a&amp;y=b"`,
    );
  });

  it("always declares both xmlns and xmlns:xhtml, even when no entry has alternates", () => {
    const xml = sitemapShardToXml(
      makeShard({
        entries: [
          {
            url: "https://apelviken.rutgr.com/a",
            lastmod: null,
            alternates: [],
          },
        ],
      }),
    );
    expect(xml).toContain(
      `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
    );
    expect(xml).toContain(`xmlns:xhtml="http://www.w3.org/1999/xhtml"`);
  });

  it("is deterministic across two calls with identical input", () => {
    const shard = makeShard({
      entries: [
        {
          url: "https://apelviken.rutgr.com/a",
          lastmod: new Date("2026-04-01T00:00:00Z"),
          alternates: [
            { hreflang: "sv", url: "https://apelviken.rutgr.com/a" },
          ],
        },
      ],
    });
    expect(sitemapShardToXml(shard)).toBe(sitemapShardToXml(shard));
  });
});
