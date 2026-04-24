import { describe, expect, it } from "vitest";

import { stripEmptySeoKeys } from "./strip-empty";

describe("stripEmptySeoKeys", () => {
  it("strips empty-string values", () => {
    expect(stripEmptySeoKeys({ title: "", description: "real" })).toEqual({
      description: "real",
    });
  });

  it("strips whitespace-only strings (multi-space, tabs, newlines)", () => {
    expect(
      stripEmptySeoKeys({
        title: "   ",
        description: "\t\n",
        ogImageAlt: "alt",
      }),
    ).toEqual({ ogImageAlt: "alt" });
  });

  it("preserves non-empty string fields verbatim (no trimming of inner content)", () => {
    // Strip only targets all-whitespace values — a leading/trailing
    // space inside otherwise-meaningful text is the merchant's choice
    // to keep. Preserving verbatim avoids silently mutating payloads.
    expect(
      stripEmptySeoKeys({ title: "  Padded title  " }),
    ).toEqual({ title: "  Padded title  " });
  });

  it("preserves boolean fields (noindex=false, nofollow=true)", () => {
    // `noindex: false` is a real merchant decision — "yes, keep this
    // page indexable". Stripping it would lose the signal.
    expect(
      stripEmptySeoKeys({
        noindex: false,
        nofollow: true,
      }),
    ).toEqual({ noindex: false, nofollow: true });
  });

  it("preserves ogImageId (non-empty string that shouldn't be stripped)", () => {
    expect(
      stripEmptySeoKeys({ ogImageId: "media_cuid_123" }),
    ).toEqual({ ogImageId: "media_cuid_123" });
  });

  it("strips empty-string ogImageId (merchant cleared the image)", () => {
    expect(stripEmptySeoKeys({ ogImageId: "" })).toEqual({});
  });

  it("handles mixed payloads end-to-end", () => {
    expect(
      stripEmptySeoKeys({
        title: "",
        description: "real description",
        ogImageId: "media_1",
        ogImageAlt: "",
        noindex: false,
        nofollow: false,
      }),
    ).toEqual({
      description: "real description",
      ogImageId: "media_1",
      noindex: false,
      nofollow: false,
    });
  });

  it("returns empty object for empty input", () => {
    expect(stripEmptySeoKeys({})).toEqual({});
  });
});
