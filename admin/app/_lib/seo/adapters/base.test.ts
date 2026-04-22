import { beforeEach, describe, expect, it } from "vitest";

import {
  _clearSeoAdaptersForTests,
  getAllSeoAdapters,
  getSeoAdapter,
  registerSeoAdapter,
  type SeoAdapter,
} from "./base";
import type { SeoResourceType } from "../types";

function makeAdapter(resourceType: SeoResourceType): SeoAdapter {
  return {
    resourceType,
    toSeoable: () => {
      throw new Error("test fixture: toSeoable not used");
    },
    toStructuredData: () => [],
    isIndexable: () => true,
    getSitemapEntries: () => [],
  };
}

describe("SeoAdapter registry", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
  });

  it("registering an adapter makes it retrievable by resource type", () => {
    const adapter = makeAdapter("product");
    registerSeoAdapter(adapter);
    expect(getSeoAdapter("product")).toBe(adapter);
  });

  it("getSeoAdapter throws for an unregistered resource type", () => {
    expect(() => getSeoAdapter("accommodation")).toThrow(
      /No SEO adapter registered for resource type "accommodation"/,
    );
  });

  it("registering the same resource type twice replaces the first adapter", () => {
    const first = makeAdapter("product");
    const second = makeAdapter("product");
    registerSeoAdapter(first);
    registerSeoAdapter(second);
    expect(getSeoAdapter("product")).toBe(second);
    expect(getSeoAdapter("product")).not.toBe(first);
  });

  it("getAllSeoAdapters returns every registered adapter", () => {
    const a = makeAdapter("product");
    const b = makeAdapter("article");
    const c = makeAdapter("accommodation");
    registerSeoAdapter(a);
    registerSeoAdapter(b);
    registerSeoAdapter(c);

    const all = getAllSeoAdapters();
    expect(all).toHaveLength(3);
    expect(all).toEqual(expect.arrayContaining([a, b, c]));
  });

  it("_clearSeoAdaptersForTests empties the registry", () => {
    registerSeoAdapter(makeAdapter("product"));
    registerSeoAdapter(makeAdapter("article"));
    expect(getAllSeoAdapters()).toHaveLength(2);

    _clearSeoAdaptersForTests();
    expect(getAllSeoAdapters()).toHaveLength(0);
    expect(() => getSeoAdapter("product")).toThrow();
  });
});
