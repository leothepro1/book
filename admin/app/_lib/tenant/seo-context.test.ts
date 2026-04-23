import { describe, expect, it } from "vitest";

import type { Tenant, TenantLocale } from "@prisma/client";

import { tenantToSeoContext } from "./seo-context";

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  // Only the fields our helper reads are relevant; everything else can
  // default to type-safe empties. We construct the full shape once so
  // TypeScript checks the cast.
  const base: Tenant = {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
    slug: "apelviken",
    portalSlug: "apelviken-x4k9",
    ownerClerkUserId: null,
    settings: null,
    seoDefaults: null,
    draftSettings: null,
    draftUpdatedAt: null,
    draftUpdatedBy: null,
    settingsVersion: 0,
    previousSettings: null,
    legalName: null,
    businessType: null,
    nickname: null,
    phone: null,
    addressStreet: null,
    addressPostalCode: null,
    addressCity: null,
    addressCountry: null,
    organizationNumber: null,
    vatNumber: null,
    emailFrom: null,
    emailFromName: null,
    pendingEmailFrom: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    emailVerificationSentTo: null,
    emailLogoUrl: null,
    emailLogoWidth: null,
    emailAccentColor: null,
    orderNumberPrefix: "",
    orderNumberSuffix: "",
    checkinEnabled: false,
    checkoutEnabled: false,
    earlyCheckinEnabled: false,
    earlyCheckinDays: 0,
    screenshotDesktopUrl: null,
    screenshotMobileUrl: null,
    screenshotHash: null,
    screenshotUpdatedAt: null,
    screenshotPending: false,
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    stripeLivemode: false,
    stripeConnectedAt: null,
    paymentMethodConfig: null,
    subscriptionPlan: "BASIC",
    platformFeeBps: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    discountsEnabled: true,
    showLoginLinks: true,
  };
  return { ...base, ...overrides };
}

function makeLocale(overrides: Partial<TenantLocale> = {}): TenantLocale {
  return {
    id: "loc_1",
    tenantId: "tenant_t",
    locale: "sv",
    published: true,
    primary: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("tenantToSeoContext", () => {
  it("builds the expected SeoTenantContext from Tenant + locales", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant(),
      locales: [
        makeLocale({ locale: "sv", primary: true, published: true }),
        makeLocale({ id: "loc_2", locale: "en", primary: false, published: true }),
      ],
    });
    expect(ctx).toMatchObject({
      id: "tenant_t",
      siteName: "Apelviken",
      primaryDomain: "apelviken-x4k9.rutgr.com",
      defaultLocale: "sv",
      activeLocales: ["sv", "en"],
    });
    // titleTemplate default from schema
    expect(ctx.seoDefaults.titleTemplate).toBe("{entityTitle} | {siteName}");
  });

  it("falls back to PRIMARY_LOCALE when no locale has primary=true", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant(),
      locales: [
        makeLocale({ locale: "en", primary: false, published: true }),
      ],
    });
    expect(ctx.defaultLocale).toBe("sv");
  });

  it("prepends defaultLocale when it is NOT flagged published", () => {
    // Edge: primary row unpublished. Hreflang must still see it.
    const ctx = tenantToSeoContext({
      tenant: makeTenant(),
      locales: [
        makeLocale({ locale: "sv", primary: true, published: false }),
        makeLocale({ id: "loc_2", locale: "en", primary: false, published: true }),
      ],
    });
    expect(ctx.defaultLocale).toBe("sv");
    expect(ctx.activeLocales).toEqual(["sv", "en"]);
  });

  it("only includes published locales (non-primary unpublished are dropped)", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant(),
      locales: [
        makeLocale({ locale: "sv", primary: true, published: true }),
        makeLocale({ id: "loc_2", locale: "en", primary: false, published: false }),
      ],
    });
    expect(ctx.activeLocales).toEqual(["sv"]);
  });

  it("falls back to rutgr.com when tenant has no portalSlug", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant({ portalSlug: null }),
      locales: [makeLocale({ primary: true, published: true })],
    });
    expect(ctx.primaryDomain).toBe("rutgr.com");
  });

  it("builds primaryDomain from portalSlug when present", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant({ portalSlug: "foo-bar-1z" }),
      locales: [makeLocale({ primary: true, published: true })],
    });
    expect(ctx.primaryDomain).toBe("foo-bar-1z.rutgr.com");
  });

  it("parses tenant.seoDefaults JSONB through safeParseSeoDefaults", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant({
        seoDefaults: {
          titleTemplate: "{entityTitle} :: {siteName}",
          twitterSite: "@apelviken",
        },
      }),
      locales: [makeLocale({ primary: true, published: true })],
    });
    expect(ctx.seoDefaults.titleTemplate).toBe(
      "{entityTitle} :: {siteName}",
    );
    expect(ctx.seoDefaults.twitterSite).toBe("@apelviken");
  });

  it("degrades gracefully when seoDefaults JSONB is malformed", () => {
    const ctx = tenantToSeoContext({
      tenant: makeTenant({ seoDefaults: { titleTemplate: 123 } }),
      locales: [makeLocale({ primary: true, published: true })],
    });
    // safeParseSeoDefaults returns the defaults on malformed input
    expect(ctx.seoDefaults.titleTemplate).toBe("{entityTitle} | {siteName}");
  });

  // ── contentUpdatedAt — Tenant.updatedAt proxy ──────────────
  //
  // Today sourced from Tenant.updatedAt (Prisma @updatedAt).
  // Used by synthetic-page adapters (homepage, accommodation-index)
  // as the `lastmod` source when no per-entity updatedAt exists.
  // The migration path to a dedicated Tenant.settingsPublishedAt
  // column is documented in SeoTenantContext.contentUpdatedAt
  // JSDoc (search: "TODO(post-m7)").

  it("contentUpdatedAt === tenant.updatedAt (current proxy semantic)", () => {
    const updatedAt = new Date("2026-04-23T09:15:00Z");
    const ctx = tenantToSeoContext({
      tenant: makeTenant({ updatedAt }),
      locales: [makeLocale({ primary: true, published: true })],
    });
    expect(ctx.contentUpdatedAt.getTime()).toBe(updatedAt.getTime());
  });

  it("contentUpdatedAt is stable across two calls with identical tenant", () => {
    const tenant = makeTenant({
      updatedAt: new Date("2026-04-01T00:00:00Z"),
    });
    const locales = [makeLocale({ primary: true, published: true })];
    const a = tenantToSeoContext({ tenant, locales });
    const b = tenantToSeoContext({ tenant, locales });
    expect(a.contentUpdatedAt.getTime()).toBe(b.contentUpdatedAt.getTime());
  });
});
