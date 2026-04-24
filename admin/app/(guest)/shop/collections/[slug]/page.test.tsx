/**
 * Tests for `/shop/collections/[slug]` generateMetadata.
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
vi.mock("@/app/(guest)/_lib/locale/getRequestLocale", () => ({
  getRequestLocale: vi.fn(async () => "sv"),
}));
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    productCollection: { findUnique: vi.fn() },
  },
}));
vi.mock("@/app/_lib/translations/apply-db-translations", () => ({
  applyTranslations: vi.fn(),
  applyTranslationsBatch: vi.fn(),
}));
vi.mock("@/app/(guest)/_components/cards/ProductCard", () => ({
  ProductCard: () => null,
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
    title: "Mat & Dryck | Apelviken",
    description: "Kvällar med vin.",
    canonicalUrl:
      "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
    canonicalPath: "/shop/collections/mat-och-dryck",
    noindex: false,
    nofollow: false,
    openGraph: {
      type: "website",
      url: "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
      title: "Mat & Dryck | Apelviken",
      description: "Kvällar med vin.",
      siteName: "Apelviken",
      locale: "sv",
      image: null,
    },
    twitterCard: {
      card: "summary",
      site: null,
      title: "Mat & Dryck | Apelviken",
      description: "Kvällar med vin.",
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
});

// ──────────────────────────────────────────────────────────────

describe("/shop/collections/[slug] generateMetadata", () => {
  it("returns a noindex stub when tenant cannot be resolved", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(null);

    const meta: Metadata = await generateMetadata({
      params: params("mat-och-dryck"),
    });

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

    const meta = await generateMetadata({ params: params("mat-och-dryck") });

    expect(meta.title).toBe("Mat & Dryck | Apelviken");
    expect(meta.description).toBe("Kvällar med vin.");
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
    );
  });

  it("passes the `product_collection` resourceType with the url slug to the resolver", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    await generateMetadata({ params: params("mat-och-dryck") });

    expect(resolveSeoForRequest).toHaveBeenCalledWith(
      "tenant_t",
      "mat-och-dryck",
      "sv",
      "product_collection",
    );
  });
});
