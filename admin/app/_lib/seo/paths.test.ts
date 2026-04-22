import { describe, expect, it } from "vitest";

import { buildAbsoluteUrl, buildLocalePath } from "./paths";
import type { SeoTenantContext } from "./types";

const tenant: SeoTenantContext = {
  id: "tenant_test",
  siteName: "Apelviken",
  primaryDomain: "apelviken-test.rutgr.com",
  defaultLocale: "sv",
  seoDefaults: { titleTemplate: "x" },
  activeLocales: ["sv", "en", "de"],
};

describe("buildLocalePath", () => {
  it("returns the bare base path for the default locale", () => {
    expect(buildLocalePath(tenant, "sv", "/accommodations/stuga-1")).toBe(
      "/accommodations/stuga-1",
    );
  });

  it("prefixes non-default locales", () => {
    expect(buildLocalePath(tenant, "en", "/accommodations/stuga-1")).toBe(
      "/en/accommodations/stuga-1",
    );
    expect(buildLocalePath(tenant, "de", "/foo")).toBe("/de/foo");
  });
});

describe("buildAbsoluteUrl", () => {
  it("builds https URL using the tenant primaryDomain", () => {
    expect(buildAbsoluteUrl(tenant, "sv", "/foo")).toBe(
      "https://apelviken-test.rutgr.com/foo",
    );
  });

  it("includes the locale prefix for non-default locales", () => {
    expect(buildAbsoluteUrl(tenant, "en", "/foo")).toBe(
      "https://apelviken-test.rutgr.com/en/foo",
    );
  });
});
