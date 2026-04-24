/**
 * Tests for `/search` generateMetadata.
 *
 * Mocks everything the page module loads transitively (theme
 * renderer, tenant config, booking) — the test only exercises
 * generateMetadata, not the default export, so those mocks exist
 * purely to keep `import("./page")` from pulling live subsystems.
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

/**
 * Build a synthetic `ResolvedSeo` for tests. `noindex` defaults to
 * true — matching the `/search` contract — but override per-test to
 * verify that `toNextMetadata` consumes the flag faithfully.
 */
function resolvedSeoStub(overrides: Partial<ResolvedSeo> = {}): ResolvedSeo {
  return {
    title: "Sök | Apelviken",
    description: null,
    canonicalUrl: "https://apelviken-x.rutgr.com/search",
    canonicalPath: "/search",
    noindex: true,
    nofollow: false,
    openGraph: {
      type: "website",
      url: "https://apelviken-x.rutgr.com/search",
      title: "Sök | Apelviken",
      description: null,
      siteName: "Apelviken",
      locale: "sv",
      image: null,
    },
    twitterCard: {
      card: "summary",
      site: null,
      title: "Sök | Apelviken",
      description: null,
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

describe("/search generateMetadata", () => {
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

  it("emits robots: { index: false, follow: true } on the happy path — search is ALWAYS noindex", async () => {
    // Search's adapter `isIndexable` always returns false, so the
    // resolver always produces `noindex: true`. Even if the tenant
    // and resolver are healthy, metadata must forbid indexing.
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    const meta = await generateMetadata();

    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.title).toBe("Sök | Apelviken");
  });

  it("passes the correct resourceType and empty slug to the resolver", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantStub() as unknown as Awaited<ReturnType<typeof resolveTenantFromHost>>,
    );
    vi.mocked(resolveSeoForRequest).mockResolvedValue(resolvedSeoStub());

    await generateMetadata();

    expect(resolveSeoForRequest).toHaveBeenCalledWith(
      "tenant_t",
      "",
      "sv",
      "search",
    );
  });
});
