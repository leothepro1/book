import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../_lib/db/prisma", () => ({
  prisma: {
    tenantLocale: { findMany: vi.fn() },
  },
}));

vi.mock("../../../_lib/logger", () => ({ log: vi.fn() }));

vi.mock("../tenant/getCurrentTenant", () => ({
  getCurrentTenant: vi.fn(),
}));

vi.mock("../auth/devAuth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../../../_lib/seo/preview", () => ({
  previewSeoForEntity: vi.fn(),
}));

import type { Tenant, TenantLocale } from "@prisma/client";

import { prisma } from "../../../_lib/db/prisma";
import { log } from "../../../_lib/logger";
import { previewSeoForEntity } from "../../../_lib/seo/preview";
import type { SeoPreviewResult } from "../../../_lib/seo/preview";

import { requireAdmin } from "../auth/devAuth";
import { getCurrentTenant } from "../tenant/getCurrentTenant";

import { previewSeoAction } from "./previewAction";

// ── Fixtures ──────────────────────────────────────────────────

function tenantRow(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
    slug: "apelviken",
    portalSlug: "apelviken-x",
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
}

function localeRow(): TenantLocale {
  return {
    id: "loc_sv",
    tenantId: "tenant_t",
    locale: "sv",
    published: true,
    primary: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function previewStub(): SeoPreviewResult {
  return {
    title: "Stuga Björk | Apelviken",
    description: "En mysig stuga vid havet.",
    canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
    ogImageUrl: null,
    faviconUrl: null,
  };
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(getCurrentTenant).mockReset();
  vi.mocked(previewSeoForEntity).mockReset();
  vi.mocked(prisma.tenantLocale.findMany).mockReset();
  vi.mocked(log).mockReset();
});

// ──────────────────────────────────────────────────────────────

describe("previewSeoAction", () => {
  it("rejects non-admin callers before any engine work", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      error: "Forbidden",
    });

    const result = await previewSeoAction({
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: {},
    });

    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(previewSeoForEntity).not.toHaveBeenCalled();
  });

  it("rejects when the client supplies overrides that fail Zod validation", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: tenantRow(),
      clerkUserId: "u_1",
      clerkOrgId: "org_1",
    });

    const result = await previewSeoAction({
      resourceType: "accommodation",
      entityId: "acc_1",
      // `title` exceeds SeoMetadataSchema's 255-char cap.
      overrides: { title: "a".repeat(500) },
    });

    expect(result).toEqual({ ok: false, error: "Ogiltig indata" });
    expect(previewSeoForEntity).not.toHaveBeenCalled();
  });

  it("passes parsed overrides through to previewSeoForEntity on the happy path", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: tenantRow(),
      clerkUserId: "u_1",
      clerkOrgId: "org_1",
    });
    vi.mocked(prisma.tenantLocale.findMany).mockResolvedValue([localeRow()]);
    vi.mocked(previewSeoForEntity).mockResolvedValue(previewStub());

    const result = await previewSeoAction({
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: { title: "Ny titel" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.canonicalUrl).toBe(
        "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      );
    }
    expect(previewSeoForEntity).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: expect.objectContaining({ title: "Ny titel" }),
      locale: "sv",
    });
  });

  it("catches engine throws, logs the failure, returns a generic user-visible error", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: tenantRow(),
      clerkUserId: "u_1",
      clerkOrgId: "org_1",
    });
    vi.mocked(prisma.tenantLocale.findMany).mockResolvedValue([localeRow()]);
    vi.mocked(previewSeoForEntity).mockRejectedValue(
      new Error("resolver exploded"),
    );

    const result = await previewSeoAction({
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: {},
    });

    expect(result).toEqual({
      ok: false,
      error: "Kunde inte generera förhandsvisning",
    });
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.preview.failed",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation",
        entityId: "acc_1",
        error: "resolver exploded",
      }),
    );
  });

  it("uses the tenant's default locale (never a client-supplied locale) for the preview", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: tenantRow(),
      clerkUserId: "u_1",
      clerkOrgId: "org_1",
    });
    // Two locales published, "en" primary — verifies the action
    // reads `defaultLocale` from SeoTenantContext (not the first
    // row in insertion order).
    const enPrimary: TenantLocale = {
      ...localeRow(),
      id: "loc_en",
      locale: "en",
    };
    const svSecondary: TenantLocale = {
      ...localeRow(),
      id: "loc_sv",
      locale: "sv",
      primary: false,
    };
    vi.mocked(prisma.tenantLocale.findMany).mockResolvedValue([
      svSecondary,
      enPrimary,
    ]);
    vi.mocked(previewSeoForEntity).mockResolvedValue(previewStub());

    await previewSeoAction({
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: {},
    });

    const callArgs = vi.mocked(previewSeoForEntity).mock.calls[0][0];
    expect(callArgs.locale).toBe("en");
    expect(callArgs.tenantId).toBe("tenant_t");
  });
});
