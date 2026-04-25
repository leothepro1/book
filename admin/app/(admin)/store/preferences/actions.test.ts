/**
 * Preferences — server action tests
 * ══════════════════════════════════
 *
 * Covers the three guarantees that matter beyond input validation:
 *   1. Save MERGES into existing `seoDefaults` — never clobbers
 *      unrelated fields (titleTemplate, organizationSchema, etc.).
 *   2. Cross-tenant publicId injection is rejected — a merchant who
 *      pastes another tenant's MediaAsset publicId cannot persist
 *      that id in their own seoDefaults.
 *   3. Malformed input is rejected at the Zod boundary.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock specifiers must match what the SUT imports — actions.ts now
// uses relative paths (same reason lib/seo uses relative paths
// internally: vitest's @-alias resolution breaks on transitive
// cross-dir imports). See M3 commit for the original diagnosis.
vi.mock("../../../_lib/db/prisma", () => ({
  prisma: {
    tenant: { update: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../_lib/logger", () => ({ log: vi.fn() }));

vi.mock("../../_lib/tenant/getCurrentTenant", () => ({
  getCurrentTenant: vi.fn(),
}));

vi.mock("../../_lib/auth/devAuth", () => ({
  requireAdmin: vi.fn(),
}));

import type { Tenant } from "@prisma/client";

import { prisma } from "../../../_lib/db/prisma";
import { requireAdmin } from "../../_lib/auth/devAuth";
import { getCurrentTenant } from "../../_lib/tenant/getCurrentTenant";
import {
  SEO_HOMEPAGE_DESCRIPTION_MAX,
  SEO_HOMEPAGE_TITLE_MAX,
} from "../../../_lib/seo/types";

import {
  getHomepagePreferences,
  saveHomepagePreferences,
} from "./actions";

type UpdateTenant = typeof prisma.tenant.update;
type FindFirstMedia = typeof prisma.mediaAsset.findFirst;

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.tenant.update as UpdateTenant).mockReset();
  vi.mocked(prisma.mediaAsset.findFirst as FindFirstMedia).mockReset();
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(getCurrentTenant).mockReset();
  // Happy-path defaults.
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
  vi.mocked(prisma.tenant.update as UpdateTenant).mockResolvedValue(
    makeTenant() as never,
  );
});

// ── saveHomepagePreferences ─────────────────────────────────

describe("saveHomepagePreferences — merge behavior", () => {
  it("preserves titleTemplate, organizationSchema, and other unrelated fields", async () => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant({
        seoDefaults: {
          titleTemplate: "{entityTitle} — Apelviken",
          descriptionDefault: "Default description",
          twitterSite: "@apelviken",
          organizationSchema: {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Apelviken AB",
          },
        },
      }),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });

    const result = await saveHomepagePreferences({
      title: "New Homepage Title",
      description: "New description",
      ogImagePublicId: null,
      noindex: false,
    });

    expect(result.ok).toBe(true);
    const call = vi.mocked(prisma.tenant.update as UpdateTenant).mock.calls[0][0];
    // Use structured assertion: the stored seoDefaults must contain
    // everything we started with, unchanged, plus the new homepage.
    const stored = call.data.seoDefaults as Record<string, unknown>;
    expect(stored.titleTemplate).toBe("{entityTitle} — Apelviken");
    expect(stored.descriptionDefault).toBe("Default description");
    expect(stored.twitterSite).toBe("@apelviken");
    expect(stored.organizationSchema).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Apelviken AB",
    });
    // `noindex` is filled in by Zod's `.default(false)` when the schema
    // round-trips the merged object — present but harmless.
    expect(stored.homepage).toEqual({
      title: "New Homepage Title",
      description: "New description",
      noindex: false,
    });
  });

  it("merges with existing homepage fields without wiping unset keys", async () => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant({
        seoDefaults: {
          titleTemplate: "x",
          homepage: {
            title: "Old Title",
            description: "Old description",
            ogImageId: "old_media_id",
          },
        },
      }),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });
    // Save with only a new title — description and image are cleared in
    // this form session.
    const result = await saveHomepagePreferences({
      title: "New Title",
      description: "",
      ogImagePublicId: null,
      noindex: false,
    });
    expect(result.ok).toBe(true);
    const call = vi.mocked(prisma.tenant.update as UpdateTenant).mock.calls[0][0];
    const stored = call.data.seoDefaults as Record<string, unknown>;
    const storedHomepage = stored.homepage as Record<string, unknown>;
    // Title updated.
    expect(storedHomepage.title).toBe("New Title");
    // Description + ogImageId cleared (absent from the stored object).
    expect(storedHomepage.description).toBeUndefined();
    expect(storedHomepage.ogImageId).toBeUndefined();
  });

  it("resolves publicId → MediaAsset.id (tenant-scoped) before persisting", async () => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant(),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });
    vi.mocked(prisma.mediaAsset.findFirst as FindFirstMedia).mockResolvedValue(
      { id: "media_resolved_id" } as never,
    );

    const result = await saveHomepagePreferences({
      title: "Home",
      description: "",
      ogImagePublicId: "cloudinary/public/id",
      noindex: false,
    });

    expect(result.ok).toBe(true);
    expect(prisma.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicId: "cloudinary/public/id",
          tenantId: "tenant_t",
          deletedAt: null,
        }),
      }),
    );
    const call = vi.mocked(prisma.tenant.update as UpdateTenant).mock.calls[0][0];
    const stored = call.data.seoDefaults as Record<string, unknown>;
    const storedHomepage = stored.homepage as Record<string, unknown>;
    expect(storedHomepage.ogImageId).toBe("media_resolved_id");
  });
});

describe("saveHomepagePreferences — rejection paths", () => {
  beforeEach(() => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant(),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });
  });

  it("rejects with a merchant-readable error when publicId lookup returns null (cross-tenant safety)", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirstMedia).mockResolvedValue(
      null,
    );
    const result = await saveHomepagePreferences({
      title: "Home",
      description: "",
      ogImagePublicId: "someone-elses-public-id",
      noindex: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Den valda bilden");
    }
    // Critically: prisma.tenant.update must NOT have run.
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rejects titles over SEO_HOMEPAGE_TITLE_MAX (Zod at boundary)", async () => {
    const result = await saveHomepagePreferences({
      title: "x".repeat(SEO_HOMEPAGE_TITLE_MAX + 1),
      description: "",
      ogImagePublicId: null,
      noindex: false,
    });
    expect(result.ok).toBe(false);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rejects descriptions over SEO_HOMEPAGE_DESCRIPTION_MAX", async () => {
    const result = await saveHomepagePreferences({
      title: "Home",
      description: "x".repeat(SEO_HOMEPAGE_DESCRIPTION_MAX + 1),
      ogImagePublicId: null,
      noindex: false,
    });
    expect(result.ok).toBe(false);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rejects when requireAdmin fails", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      error: "Admin krävs",
    });
    const result = await saveHomepagePreferences({
      title: "Home",
      description: "",
      ogImagePublicId: null,
      noindex: false,
    });
    expect(result.ok).toBe(false);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rejects when no tenant is resolved", async () => {
    vi.mocked(getCurrentTenant).mockResolvedValue(null);
    const result = await saveHomepagePreferences({
      title: "Home",
      description: "",
      ogImagePublicId: null,
      noindex: false,
    });
    expect(result.ok).toBe(false);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("whitespace-only title is treated as cleared (not rejected — server trims and drops the key)", async () => {
    const result = await saveHomepagePreferences({
      title: "    ",
      description: "",
      ogImagePublicId: null,
      noindex: false,
    });
    expect(result.ok).toBe(true);
    const call = vi.mocked(prisma.tenant.update as UpdateTenant).mock.calls[0][0];
    const stored = call.data.seoDefaults as Record<string, unknown>;
    const storedHomepage = stored.homepage as Record<string, unknown>;
    expect(storedHomepage.title).toBeUndefined();
  });
});

// ── getHomepagePreferences ──────────────────────────────────

describe("getHomepagePreferences", () => {
  beforeEach(() => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant({
        seoDefaults: {
          titleTemplate: "x",
          homepage: {
            title: "Stored Title",
            description: "Stored description",
            ogImageId: "media_123",
          },
        },
      }),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });
  });

  it("returns parsed homepage fields + tenant display data", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirstMedia).mockResolvedValue(
      {
        id: "media_123",
        publicId: "cloudinary/123",
        url: "https://cdn/image.jpg",
      } as never,
    );

    const snap = await getHomepagePreferences();

    expect(snap).not.toBeNull();
    expect(snap?.title).toBe("Stored Title");
    expect(snap?.description).toBe("Stored description");
    expect(snap?.siteName).toBe("Apelviken");
    expect(snap?.primaryDomain).toBe("apelviken-x.rutgr.com");
    expect(snap?.ogImage).toEqual({
      id: "media_123",
      publicId: "cloudinary/123",
      url: "https://cdn/image.jpg",
    });
  });

  it("ogImage is null when MediaAsset has been deleted/missing even though id is in JSONB", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirstMedia).mockResolvedValue(
      null,
    );
    const snap = await getHomepagePreferences();
    expect(snap?.ogImage).toBeNull();
  });

  it("returns empty strings when tenant has no seoDefaults yet (backward compat)", async () => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant({ seoDefaults: null }),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });
    const snap = await getHomepagePreferences();
    expect(snap?.title).toBe("");
    expect(snap?.description).toBe("");
    expect(snap?.ogImage).toBeNull();
  });

  it("falls back to rutgr.com when tenant has no portalSlug", async () => {
    vi.mocked(getCurrentTenant).mockResolvedValue({
      tenant: makeTenant({ portalSlug: null }),
      clerkUserId: "user_1",
      clerkOrgId: "org_1",
    });
    const snap = await getHomepagePreferences();
    expect(snap?.primaryDomain).toBe("rutgr.com");
  });
});
