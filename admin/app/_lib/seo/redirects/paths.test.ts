import { describe, expect, it } from "vitest";

import { buildRedirectPath, normalizeRedirectPath } from "./paths";

describe("buildRedirectPath — mutable-slug resources", () => {
  it("builds /shop/products/{slug} for product", () => {
    expect(buildRedirectPath("product", "frukost-buffe")).toBe(
      "/shop/products/frukost-buffe",
    );
  });

  it("builds /shop/collections/{slug} for product_collection", () => {
    expect(buildRedirectPath("product_collection", "mat-och-dryck")).toBe(
      "/shop/collections/mat-och-dryck",
    );
  });

  it("builds /stays/{slug} for accommodation", () => {
    expect(buildRedirectPath("accommodation", "stuga-bjork")).toBe(
      "/stays/stuga-bjork",
    );
  });

  it("builds /stays/categories/{slug} for accommodation_category", () => {
    expect(buildRedirectPath("accommodation_category", "stugor")).toBe(
      "/stays/categories/stugor",
    );
  });
});

describe("buildRedirectPath — non-slug-owning resources return null", () => {
  // These resource types either have no merchant-editable slug
  // (homepage, search) or no /new flow (accommodation_index,
  // page/article/blog) — callers must skip redirect logic.
  it.each([
    "homepage",
    "search",
    "accommodation_index",
    "page",
    "article",
    "blog",
    "product_index",
  ] as const)("returns null for %s", (resourceType) => {
    expect(buildRedirectPath(resourceType, "some-slug")).toBeNull();
  });
});

describe("normalizeRedirectPath", () => {
  it("lowercases uppercase segments", () => {
    expect(normalizeRedirectPath("/Shop/Products/Foo-BAR")).toBe(
      "/shop/products/foo-bar",
    );
  });

  it("strips a single trailing slash", () => {
    expect(normalizeRedirectPath("/shop/products/foo/")).toBe(
      "/shop/products/foo",
    );
  });

  it("preserves the bare root path `/`", () => {
    // Root is the one case where a trailing slash is structural.
    expect(normalizeRedirectPath("/")).toBe("/");
  });

  it("is idempotent — already-normalized input passes through unchanged", () => {
    const already = "/shop/products/foo";
    expect(normalizeRedirectPath(already)).toBe(already);
  });

  it("applies lowercase + trailing-slash strip in one pass", () => {
    expect(normalizeRedirectPath("/Stays/Categories/Stugor/")).toBe(
      "/stays/categories/stugor",
    );
  });

  it("preserves inner slashes + characters", () => {
    // The helper does NOT strip query strings or fragments — that's
    // the caller's job. If someone forgets to strip `?utm=…`, the
    // path won't match any stored redirect, which is the correct
    // failure mode (caller bug, not a silent match).
    expect(normalizeRedirectPath("/foo?bar=baz")).toBe("/foo?bar=baz");
  });

  it("does not touch non-trailing inner slashes", () => {
    expect(normalizeRedirectPath("/a/b/c")).toBe("/a/b/c");
  });

  it("handles a two-character path with trailing slash", () => {
    // Not a realistic redirect target, but the length check matters
    // — `/a/` → `/a`, not `/`. Boundary between "root preserve" and
    // "strip trailing slash".
    expect(normalizeRedirectPath("/a/")).toBe("/a");
  });
});
