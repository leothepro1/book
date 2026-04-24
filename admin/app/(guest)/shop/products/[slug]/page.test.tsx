/**
 * Tests for `/shop/products/[slug]` generateMetadata.
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
vi.mock("@/app/_lib/products/actions", () => ({
  getProductBySlug: vi.fn(),
  isAccommodationSlug: vi.fn(async () => false),
}));
vi.mock("@/app/_lib/translations/apply-db-translations", () => ({
  applyTranslations: vi.fn(),
}));
vi.mock("@/app/(guest)/_components/GuestPageShell", () => ({
  default: () => null,
}));
vi.mock("@/app/(guest)/_lib/product-context/ShopProductProvider", () => ({
  ShopProductProvider: () => null,
}));
vi.mock("./ShopProductLayout", () => ({
  ShopProductLayout: () => null,
}));
vi.mock("@/app/_lib/seo/request-cache", () => ({
  resolveSeoForRequest: vi.fn(),
}));

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { isAccommodationSlug } from "@/app/_lib/products/actions";
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
    title: "Frukost-buffé | Apelviken",
    description: "Morgonens vackraste ritual.",
    canonicalUrl: "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
    canonicalPath: "/shop/products/frukost-buffe",
    noindex: false,
    nofollow: false,
    openGraph: {
      type: "website",
      url: "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
      title: "Frukost-buffé | Apelviken",
      description: "Morgonens vackraste ritual.",
      siteName: "Apelviken",
      locale: "sv",
      image: null,
    },
    twitterCard: {
      card: "summary",
      site: null,
      title: "Frukost-buffé | Apelviken",
      description: "Morgonens vackraste ritual.",
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
  vi.mocked(resolveSeoForRequest).mockReset();
  vi.mocked(isAccommodationSlug).mockReset();
  vi.mocked(isAccommodationSlug).mockResolvedValue(false);
});

// ──────────────────────────────────────────────────────────────

describe("/shop/products/[slug] generateMetadata", () => {
  it("returns a noindex stub when tenant cannot be resolved", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(null);

    const meta: Metadata = await generateMetadata({
      params: params("frukost-buffe"),
    });

    expect(meta).toEqual({
      title: "Not found",
      robots: { index: false },
    });
    expect(resolveSeoForRequest).not.toHaveBeenCalled();
  });

  it("returns a noindex stub and skips the resolver when slug belongs to an accommodation", async () => {
    // Accommodation-slug collision: the page body redirects in this
    // case. Metadata emission must short-circuit to a defensive
    // stub — if the redirect is ever removed, Google must not index
    // /shop/products/{accommodation-slug} as a duplicate of
    // /stays/{accommodation-slug}.
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(isAccommodationSlug).mockResolvedValue(true);

    const meta = await generateMetadata({ params: params("stuga-bjork") });

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

    const meta = await generateMetadata({ params: params("no-such") });

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

    const meta = await generateMetadata({ params: params("frukost-buffe") });

    expect(meta.title).toBe("Frukost-buffé | Apelviken");
    expect(meta.description).toBe("Morgonens vackraste ritual.");
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
    );
  });

  it("passes the `product` resourceType with the url slug to the resolver", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    await generateMetadata({ params: params("frukost-buffe") });

    expect(resolveSeoForRequest).toHaveBeenCalledWith(
      "tenant_t",
      "frukost-buffe",
      "sv",
      "product",
    );
  });
});
