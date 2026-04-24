/**
 * Tests for `/` (homepage) generateMetadata.
 *
 * Mocks cover every module the page imports so that
 * `import("./page")` doesn't pull live subsystems. Only
 * generateMetadata is exercised — the default export (themed
 * storefront render path) is out of scope.
 */

import type { Metadata } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: vi.fn(),
}));
vi.mock("@/app/(guest)/_lib/tenant", () => ({
  getTenantConfig: vi.fn(),
}));
vi.mock("@/app/(guest)/_lib/locale/getRequestLocale", () => ({
  getRequestLocale: vi.fn(async () => "sv"),
}));
vi.mock("@/app/(guest)/_lib/portal/resolveBooking", () => ({
  resolveBookingFromToken: vi.fn(),
}));
vi.mock("@/app/(guest)/_lib/booking", () => ({
  getBookingStatus: vi.fn(),
}));
vi.mock("@/app/(guest)/_lib/themes", () => ({
  ThemeRenderer: () => null,
}));
vi.mock("@/app/(guest)/_components/GuestPageShell", () => ({
  default: () => null,
}));
vi.mock("@/app/(guest)/_components/seo/StructuredData", () => ({
  StructuredData: () => null,
}));
vi.mock("@/app/_lib/seo/request-cache", () => ({
  resolveSeoForRequest: vi.fn(),
}));

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveSeoForRequest } from "@/app/_lib/seo/request-cache";
import type { ResolvedSeo } from "@/app/_lib/seo/types";

import { generateMetadata } from "./page";

// ── Fixtures ──────────────────────────────────────────────────

type MinimalTenant = { id: string; name: string };

function tenantStub(): MinimalTenant {
  return { id: "tenant_t", name: "Apelviken" };
}

function resolvedSeoStub(overrides: Partial<ResolvedSeo> = {}): ResolvedSeo {
  return {
    title: "Apelviken",
    description: "Semesterby vid havet.",
    canonicalUrl: "https://apelviken-x.rutgr.com/",
    canonicalPath: "/",
    noindex: false,
    nofollow: false,
    openGraph: {
      type: "website",
      url: "https://apelviken-x.rutgr.com/",
      title: "Apelviken",
      description: "Semesterby vid havet.",
      siteName: "Apelviken",
      locale: "sv",
      image: null,
    },
    twitterCard: {
      card: "summary",
      site: null,
      title: "Apelviken",
      description: "Semesterby vid havet.",
      image: null,
    },
    hreflang: [],
    structuredData: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(resolveTenantFromHost).mockReset();
  vi.mocked(resolveSeoForRequest).mockReset();
});

// ──────────────────────────────────────────────────────────────

describe("/ (homepage) generateMetadata", () => {
  it("returns a noindex stub when tenant cannot be resolved", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(null);

    const meta: Metadata = await generateMetadata();

    expect(meta).toEqual({
      title: "Not found",
      robots: { index: false },
    });
    expect(resolveSeoForRequest).not.toHaveBeenCalled();
  });

  it("returns a noindex stub when the resolver returns null", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(null);

    const meta = await generateMetadata();

    expect(meta).toEqual({
      title: "Not found",
      robots: { index: false },
    });
  });

  it("emits the full resolved metadata on the happy path", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    const meta = await generateMetadata();

    expect(meta.title).toBe("Apelviken");
    expect(meta.description).toBe("Semesterby vid havet.");
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("https://apelviken-x.rutgr.com/");
  });

  it("passes the `homepage` resourceType with empty slug to the resolver", async () => {
    // Homepage is a synthetic resource — the tenant IS the entity.
    // The empty-string slug keeps the cache() key a 4-string tuple
    // so subsequent calls (e.g. from the page body) hit the same
    // memo slot.
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    await generateMetadata();

    expect(resolveSeoForRequest).toHaveBeenCalledWith(
      "tenant_t",
      "",
      "sv",
      "homepage",
    );
  });
});
