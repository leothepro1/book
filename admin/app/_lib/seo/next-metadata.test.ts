import { describe, expect, it } from "vitest";

import type { Metadata } from "next";

import { toNextMetadata } from "./next-metadata";
import type { ResolvedSeo } from "./types";

// ── Fixture ──────────────────────────────────────────────────

function makeResolved(overrides: Partial<ResolvedSeo> = {}): ResolvedSeo {
  return {
    title: "Stuga Björk | Apelviken",
    description: "A cosy cabin by the sea",
    canonicalUrl: "https://apelviken.rutgr.com/stays/stuga-bjork",
    canonicalPath: "/stays/stuga-bjork",
    noindex: false,
    nofollow: false,
    openGraph: {
      type: "website",
      url: "https://apelviken.rutgr.com/stays/stuga-bjork",
      title: "Stuga Björk",
      description: "A cosy cabin",
      siteName: "Apelviken",
      locale: "sv_SE",
      image: {
        url: "https://cdn.cloudinary.com/apelviken/primary.jpg",
        width: 1200,
        height: 630,
        alt: "Primary photo",
      },
    },
    twitterCard: {
      card: "summary_large_image",
      site: "@apelviken",
      title: "Stuga Björk",
      description: "A cosy cabin",
      image: {
        url: "https://cdn.cloudinary.com/apelviken/primary.jpg",
        width: 1200,
        height: 630,
        alt: "Primary photo",
      },
    },
    hreflang: [
      { code: "sv", url: "https://apelviken.rutgr.com/stays/stuga-bjork" },
      { code: "en", url: "https://apelviken.rutgr.com/en/stays/stuga-bjork" },
      {
        code: "x-default",
        url: "https://apelviken.rutgr.com/stays/stuga-bjork",
      },
    ],
    structuredData: [],
    ...overrides,
  };
}

/**
 * Walks the Metadata object and collects every URL-ish string value.
 * Used by the "every URL is absolute https://" invariant.
 */
function collectUrls(meta: Metadata): string[] {
  const urls: string[] = [];

  if (
    meta.alternates?.canonical &&
    typeof meta.alternates.canonical === "string"
  ) {
    urls.push(meta.alternates.canonical);
  }
  if (meta.alternates?.languages) {
    for (const v of Object.values(meta.alternates.languages)) {
      if (typeof v === "string") urls.push(v);
    }
  }
  if (meta.openGraph && "url" in meta.openGraph && typeof meta.openGraph.url === "string") {
    urls.push(meta.openGraph.url);
  }
  if (meta.openGraph && "images" in meta.openGraph && Array.isArray(meta.openGraph.images)) {
    for (const img of meta.openGraph.images) {
      if (typeof img === "string") urls.push(img);
      else if (img && typeof img === "object" && "url" in img) {
        const u = (img as { url: unknown }).url;
        if (typeof u === "string") urls.push(u);
      }
    }
  }
  if (meta.twitter && "images" in meta.twitter && meta.twitter.images) {
    const imgs = Array.isArray(meta.twitter.images)
      ? meta.twitter.images
      : [meta.twitter.images];
    for (const img of imgs) {
      if (typeof img === "string") urls.push(img);
      else if (img && typeof img === "object" && "url" in img) {
        const u = (img as { url: unknown }).url;
        if (typeof u === "string") urls.push(u);
      }
    }
  }
  return urls;
}

// ── Scalars ──────────────────────────────────────────────────

describe("toNextMetadata — scalars", () => {
  it("maps title and description through", () => {
    const m = toNextMetadata(makeResolved());
    expect(m.title).toBe("Stuga Björk | Apelviken");
    expect(m.description).toBe("A cosy cabin by the sea");
  });

  it("converts null description to undefined (Next type rejects null)", () => {
    const m = toNextMetadata(makeResolved({ description: null }));
    expect(m.description).toBeUndefined();
  });

  it("emits robots: { index: true, follow: true } for default flags", () => {
    const m = toNextMetadata(makeResolved());
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("inverts noindex/nofollow flags into robots", () => {
    const m = toNextMetadata(
      makeResolved({ noindex: true, nofollow: true }),
    );
    expect(m.robots).toEqual({ index: false, follow: false });
  });
});

// ── Canonical & hreflang ─────────────────────────────────────

describe("toNextMetadata — alternates", () => {
  it("maps canonicalUrl into alternates.canonical", () => {
    const m = toNextMetadata(makeResolved());
    expect(m.alternates?.canonical).toBe(
      "https://apelviken.rutgr.com/stays/stuga-bjork",
    );
  });

  it("maps hreflang list into alternates.languages keyed by code", () => {
    const m = toNextMetadata(makeResolved());
    expect(m.alternates?.languages).toEqual({
      sv: "https://apelviken.rutgr.com/stays/stuga-bjork",
      en: "https://apelviken.rutgr.com/en/stays/stuga-bjork",
      "x-default": "https://apelviken.rutgr.com/stays/stuga-bjork",
    });
  });

  it("emits undefined languages when hreflang list is empty", () => {
    const m = toNextMetadata(makeResolved({ hreflang: [] }));
    expect(m.alternates?.languages).toBeUndefined();
  });
});

// ── Open Graph ───────────────────────────────────────────────

describe("toNextMetadata — openGraph", () => {
  it("maps all fields including image with dimensions and alt", () => {
    const m = toNextMetadata(makeResolved());
    expect(m.openGraph).toMatchObject({
      type: "website",
      url: "https://apelviken.rutgr.com/stays/stuga-bjork",
      title: "Stuga Björk",
      description: "A cosy cabin",
      siteName: "Apelviken",
      locale: "sv_SE",
    });
    const images = m.openGraph && "images" in m.openGraph ? m.openGraph.images : null;
    expect(images).toEqual([
      {
        url: "https://cdn.cloudinary.com/apelviken/primary.jpg",
        width: 1200,
        height: 630,
        alt: "Primary photo",
      },
    ]);
  });

  it("emits undefined images when no OG image resolved", () => {
    const m = toNextMetadata(
      makeResolved({
        openGraph: { ...makeResolved().openGraph, image: null },
      }),
    );
    const images = m.openGraph && "images" in m.openGraph ? m.openGraph.images : null;
    expect(images).toBeUndefined();
  });

  it("converts null description to undefined", () => {
    const m = toNextMetadata(
      makeResolved({
        openGraph: { ...makeResolved().openGraph, description: null },
      }),
    );
    if (m.openGraph && "description" in m.openGraph) {
      expect(m.openGraph.description).toBeUndefined();
    }
  });
});

// ── Twitter Card ─────────────────────────────────────────────

describe("toNextMetadata — twitterCard", () => {
  it("maps card, site, title, description, and image URL", () => {
    const m = toNextMetadata(makeResolved());
    expect(m.twitter).toMatchObject({
      card: "summary_large_image",
      site: "@apelviken",
      title: "Stuga Björk",
      description: "A cosy cabin",
    });
    const images = m.twitter && "images" in m.twitter ? m.twitter.images : null;
    expect(images).toEqual([
      "https://cdn.cloudinary.com/apelviken/primary.jpg",
    ]);
  });

  it("converts null site to undefined", () => {
    const m = toNextMetadata(
      makeResolved({
        twitterCard: { ...makeResolved().twitterCard, site: null },
      }),
    );
    if (m.twitter && "site" in m.twitter) {
      expect(m.twitter.site).toBeUndefined();
    }
  });

  it("emits undefined images when no Twitter image resolved", () => {
    const m = toNextMetadata(
      makeResolved({
        twitterCard: { ...makeResolved().twitterCard, image: null },
      }),
    );
    const images = m.twitter && "images" in m.twitter ? m.twitter.images : null;
    expect(images).toBeUndefined();
  });
});

// ── Absolute-URL invariant ────────────────────────────────────

describe("toNextMetadata — every URL is absolute https://", () => {
  it("with full fixture: all URLs start with https://", () => {
    const m = toNextMetadata(makeResolved());
    const urls = collectUrls(m);
    // Sanity: we did collect some URLs.
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("with minimal fixture: every emitted URL is absolute", () => {
    const m = toNextMetadata(
      makeResolved({
        hreflang: [],
        openGraph: { ...makeResolved().openGraph, image: null },
        twitterCard: { ...makeResolved().twitterCard, image: null },
      }),
    );
    const urls = collectUrls(m);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
    }
  });
});
