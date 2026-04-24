/**
 * Tests for `/stays/[slug]` generateMetadata.
 *
 * Mocks cover every module the page imports so that
 * `import("./page")` doesn't pull live subsystems. Only
 * generateMetadata is exercised.
 */

import type { Metadata } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: vi.fn(),
}));
vi.mock("@/app/(guest)/_lib/tenant/getTenantConfig", () => ({
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
vi.mock("@/app/(guest)/_lib/product-context/ProductContext", () => ({
  ProductProvider: () => null,
}));
vi.mock("@/app/_lib/commerce/CommerceEngineContext", () => ({
  CommerceEngineProvider: () => null,
}));
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: vi.fn(),
}));
vi.mock("@/app/_lib/translations/apply-db-translations", () => ({
  applyTranslations: vi.fn(),
}));
vi.mock("@/app/_lib/accommodations/resolve", () => ({
  resolveAccommodation: vi.fn(),
}));
vi.mock("@/app/_lib/seo/request-cache", () => ({
  getAccommodationForSeo: vi.fn(),
  resolveSeoForRequest: vi.fn(),
}));

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import {
  getAccommodationForSeo,
  resolveSeoForRequest,
} from "@/app/_lib/seo/request-cache";
import type { ResolvedSeo } from "@/app/_lib/seo/types";

import { generateMetadata } from "./page";

// ── Fixtures ──────────────────────────────────────────────────

type MinimalTenant = { id: string; name: string };

function tenantStub(): MinimalTenant {
  return { id: "tenant_t", name: "Apelviken" };
}

/**
 * Minimal accommodation stub — generateMetadata only uses the row
 * for null/non-null distinction, not field access.
 */
function accommodationStub(): { id: string; slug: string } {
  return { id: "acc_1", slug: "stuga-bjork" };
}

function resolvedSeoStub(overrides: Partial<ResolvedSeo> = {}): ResolvedSeo {
  return {
    title: "Stuga Björk | Apelviken",
    description: "En mysig stuga vid havet.",
    canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    canonicalPath: "/stays/stuga-bjork",
    noindex: false,
    nofollow: false,
    openGraph: {
      type: "website",
      url: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      title: "Stuga Björk | Apelviken",
      description: "En mysig stuga vid havet.",
      siteName: "Apelviken",
      locale: "sv",
      image: null,
    },
    twitterCard: {
      card: "summary",
      site: null,
      title: "Stuga Björk | Apelviken",
      description: "En mysig stuga vid havet.",
      image: null,
    },
    hreflang: [],
    structuredData: [],
    ...overrides,
  };
}

function params(slug: string): Promise<{ slug: string }> {
  return Promise.resolve({ slug });
}

beforeEach(() => {
  vi.mocked(resolveTenantFromHost).mockReset();
  vi.mocked(getAccommodationForSeo).mockReset();
  vi.mocked(resolveSeoForRequest).mockReset();
});

// ──────────────────────────────────────────────────────────────

describe("/stays/[slug] generateMetadata", () => {
  it("returns a noindex stub when tenant cannot be resolved", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(null);

    const meta: Metadata = await generateMetadata({
      params: params("stuga-bjork"),
    });

    expect(meta).toEqual({
      title: "Not found",
      robots: { index: false },
    });
    expect(getAccommodationForSeo).not.toHaveBeenCalled();
    expect(resolveSeoForRequest).not.toHaveBeenCalled();
  });

  it("returns a noindex stub when the accommodation does not exist", async () => {
    // getAccommodationForSeo returns null for slugs that don't match
    // any row (and whose externalId fallback also misses). The page
    // body calls notFound() in that case; generateMetadata emits a
    // consistent noindex stub.
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(getAccommodationForSeo).mockResolvedValue(null);

    const meta = await generateMetadata({ params: params("no-such") });

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
    vi.mocked(getAccommodationForSeo).mockResolvedValue(
      accommodationStub() as unknown as Awaited<
        ReturnType<typeof getAccommodationForSeo>
      >,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(null);

    const meta = await generateMetadata({ params: params("stuga-bjork") });

    expect(meta).toEqual({
      title: "Not found",
      robots: { index: false },
    });
  });

  it("emits the full resolved metadata on the happy path", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(getAccommodationForSeo).mockResolvedValue(
      accommodationStub() as unknown as Awaited<
        ReturnType<typeof getAccommodationForSeo>
      >,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    const meta = await generateMetadata({ params: params("stuga-bjork") });

    expect(meta.title).toBe("Stuga Björk | Apelviken");
    expect(meta.description).toBe("En mysig stuga vid havet.");
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    );
  });

  it("passes the `accommodation` resourceType with the url slug to the resolver", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(getAccommodationForSeo).mockResolvedValue(
      accommodationStub() as unknown as Awaited<
        ReturnType<typeof getAccommodationForSeo>
      >,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    await generateMetadata({ params: params("stuga-bjork") });

    expect(resolveSeoForRequest).toHaveBeenCalledWith(
      "tenant_t",
      "stuga-bjork",
      "sv",
      "accommodation",
    );
  });
});
