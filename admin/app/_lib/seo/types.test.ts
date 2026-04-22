import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger", () => ({
  log: vi.fn(),
}));

import {
  SeoDefaultsSchema,
  SeoMetadataSchema,
  safeParseSeoDefaults,
  safeParseSeoMetadata,
} from "./types";
import { log } from "../logger";

describe("SeoMetadataSchema", () => {
  it("parses an empty object and applies noindex/nofollow defaults", () => {
    const result = SeoMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.noindex).toBe(false);
      expect(result.data.nofollow).toBe(false);
    }
  });

  it("parses a fully populated valid object", () => {
    const result = SeoMetadataSchema.safeParse({
      title: "Title",
      description: "Description",
      canonicalPath: "/foo/bar",
      ogImageId: "img_123",
      ogImageAlt: "Alt",
      twitterCardType: "summary_large_image",
      noindex: true,
      nofollow: true,
      structuredDataExtensions: [{ "@type": "Thing" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys (.strict())", () => {
    const result = SeoMetadataSchema.safeParse({
      title: "x",
      gremlin: "y",
    });
    expect(result.success).toBe(false);
  });

  it("rejects wrong leaf types", () => {
    const result = SeoMetadataSchema.safeParse({ title: 123 });
    expect(result.success).toBe(false);
  });

  it("accepts title at exactly 255 chars", () => {
    const r = SeoMetadataSchema.safeParse({ title: "x".repeat(255) });
    expect(r.success).toBe(true);
  });

  it("rejects title over 255 chars", () => {
    const r = SeoMetadataSchema.safeParse({ title: "x".repeat(256) });
    expect(r.success).toBe(false);
  });

  it("accepts description at exactly 500 chars", () => {
    const r = SeoMetadataSchema.safeParse({ description: "x".repeat(500) });
    expect(r.success).toBe(true);
  });

  it("rejects description over 500 chars", () => {
    const r = SeoMetadataSchema.safeParse({ description: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("rejects canonicalPath without leading slash", () => {
    const r = SeoMetadataSchema.safeParse({ canonicalPath: "foo/bar" });
    expect(r.success).toBe(false);
  });

  it("accepts canonicalPath with leading slash", () => {
    const r = SeoMetadataSchema.safeParse({ canonicalPath: "/foo/bar" });
    expect(r.success).toBe(true);
  });

  it("rejects twitterCardType outside the enum", () => {
    const r = SeoMetadataSchema.safeParse({ twitterCardType: "billboard" });
    expect(r.success).toBe(false);
  });
});

describe("SeoDefaultsSchema", () => {
  it("parses empty object with titleTemplate default applied", () => {
    const r = SeoDefaultsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.titleTemplate).toBe("{entityTitle} | {siteName}");
    }
  });

  it("accepts twitterSite with leading @", () => {
    const r = SeoDefaultsSchema.safeParse({ twitterSite: "@bedfront" });
    expect(r.success).toBe(true);
  });

  it("rejects twitterSite without leading @", () => {
    const r = SeoDefaultsSchema.safeParse({ twitterSite: "bedfront" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown keys (.strict())", () => {
    const r = SeoDefaultsSchema.safeParse({ sneaky: "field" });
    expect(r.success).toBe(false);
  });
});

describe("safeParseSeoMetadata", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("returns null for null without logging (expected 'no override' case)", () => {
    expect(safeParseSeoMetadata(null)).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("returns null for undefined without logging", () => {
    expect(safeParseSeoMetadata(undefined)).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("returns parsed object with defaults applied for empty object", () => {
    // Regression guard: if a future refactor turns .default(false) into
    // .optional(), this test fails — and so does the resolver, loudly.
    const result = safeParseSeoMetadata({});
    expect(result).not.toBeNull();
    expect(result).toEqual({ noindex: false, nofollow: false });
  });

  it("returns parsed object for valid input (defaults merged)", () => {
    const r = safeParseSeoMetadata({ title: "ok", nofollow: true });
    expect(r).toMatchObject({
      title: "ok",
      nofollow: true,
      noindex: false,
    });
  });

  it("returns null and logs on malformed input", () => {
    expect(safeParseSeoMetadata({ title: 123 })).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.metadata.parse_failed",
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it("returns null and logs when unknown keys are present", () => {
    expect(safeParseSeoMetadata({ title: "ok", unknown: true })).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.metadata.parse_failed",
      expect.any(Object),
    );
  });
});

describe("safeParseSeoDefaults", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("returns full default shape for null input without logging", () => {
    const r = safeParseSeoDefaults(null);
    expect(r.titleTemplate).toBe("{entityTitle} | {siteName}");
    expect(log).not.toHaveBeenCalled();
  });

  it("returns full default shape for undefined input without logging", () => {
    const r = safeParseSeoDefaults(undefined);
    expect(r.titleTemplate).toBe("{entityTitle} | {siteName}");
    expect(log).not.toHaveBeenCalled();
  });

  it("returns parsed shape and preserves overrides", () => {
    const r = safeParseSeoDefaults({
      titleTemplate: "{entityTitle} — Test",
      twitterSite: "@bedfront",
    });
    expect(r.titleTemplate).toBe("{entityTitle} — Test");
    expect(r.twitterSite).toBe("@bedfront");
  });

  it("falls back to defaults and logs on malformed input", () => {
    const r = safeParseSeoDefaults({ titleTemplate: 123 });
    expect(r.titleTemplate).toBe("{entityTitle} | {siteName}");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.defaults.parse_failed",
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it("falls back to defaults and logs when unknown keys are present", () => {
    const r = safeParseSeoDefaults({ sneaky: 1 });
    expect(r.titleTemplate).toBe("{entityTitle} | {siteName}");
    expect(log).toHaveBeenCalled();
  });
});
