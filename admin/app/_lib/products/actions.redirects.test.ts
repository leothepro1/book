/**
 * updateProduct / deleteProduct + updateCollection / deleteCollection
 * — SEO redirect call-site tests
 * ════════════════════════════════════════════════════════════════════
 *
 * Scope: verifies the server actions invoke `collapseAndCreate` /
 * `cleanupRedirectsForDeletedEntity` with the right arguments on
 * slug change / entity delete. The helpers' own correctness is
 * already covered by `app/_lib/seo/redirects/writes.test.ts`.
 *
 * Kept in a separate file so the focused mocking (redirects
 * barrel stubbed) doesn't affect future tests for the other
 * branches of these actions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────

const collapseAndCreate = vi.fn();
const cleanupRedirectsForDeletedEntity = vi.fn();
const getTenantDefaultLocale = vi.fn();

vi.mock("@/app/_lib/seo/redirects", () => ({
  // Keep real path builders — we want byte-for-byte assertions on
  // oldPath/newPath passed into collapseAndCreate.
  buildRedirectPath: (resourceType: string, slug: string) => {
    switch (resourceType) {
      case "product":
        return `/shop/products/${slug}`;
      case "product_collection":
        return `/shop/collections/${slug}`;
      case "accommodation_category":
        return `/stays/categories/${slug}`;
      default:
        return null;
    }
  },
  collapseAndCreate: (...args: unknown[]) => collapseAndCreate(...args),
  cleanupRedirectsForDeletedEntity: (...args: unknown[]) =>
    cleanupRedirectsForDeletedEntity(...args),
  getTenantDefaultLocale: (...args: unknown[]) => getTenantDefaultLocale(...args),
}));

const productFindFirst = vi.fn();
const collectionFindFirst = vi.fn();
const orderLineItemCount = vi.fn();
const txProductUpdate = vi.fn();
const txProductDelete = vi.fn();
const txCollectionUpdate = vi.fn();
const txCollectionDelete = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    product: {
      findFirst: (...a: unknown[]) => productFindFirst(...a),
      // resolveUniqueSlug does findUnique lookups — no conflict.
      findUnique: vi.fn().mockResolvedValue(null),
    },
    productCollection: {
      findFirst: (...a: unknown[]) => collectionFindFirst(...a),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    orderLineItem: {
      count: (...a: unknown[]) => orderLineItemCount(...a),
    },
    $transaction: vi.fn(async (callback: unknown) => {
      const fn = callback as (tx: unknown) => Promise<unknown>;
      return fn({
        product: {
          update: (...a: unknown[]) => txProductUpdate(...a),
          delete: (...a: unknown[]) => txProductDelete(...a),
        },
        productCollection: {
          update: (...a: unknown[]) => txCollectionUpdate(...a),
          delete: (...a: unknown[]) => txCollectionDelete(...a),
        },
        productMedia: { deleteMany: vi.fn(), createMany: vi.fn() },
        productOption: { deleteMany: vi.fn(), createMany: vi.fn() },
        productVariant: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        productCollectionItem: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        productTagItem: { deleteMany: vi.fn() },
        productTag: {
          upsert: vi.fn().mockResolvedValue({ id: "tag_1" }),
        },
        priceChange: { create: vi.fn() },
        findMany: vi.fn().mockResolvedValue([]),
      });
    }),
  },
}));

vi.mock("@/app/(admin)/_lib/auth/devAuth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/app/(admin)/_lib/tenant/getCurrentTenant", () => ({
  getCurrentTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("./resolve", () => ({
  resolveProduct: vi.fn(),
}));

import type { Tenant } from "@prisma/client";
import { log } from "@/app/_lib/logger";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import {
  updateProduct,
  deleteProduct,
  updateCollection,
  deleteCollection,
} from "./actions";

function primeAuth(): void {
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
  vi.mocked(getCurrentTenant).mockResolvedValue({
    tenant: { id: "tenant_t", clerkOrgId: "org_1" } as unknown as Tenant,
    clerkUserId: "u_1",
    clerkOrgId: "org_1",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantDefaultLocale.mockResolvedValue("sv");
  orderLineItemCount.mockResolvedValue(0);
  // Default update stubs — each test overrides as needed.
  txProductUpdate.mockResolvedValue({
    id: "prod_1",
    slug: "ny-slug",
    version: 2,
  });
  txCollectionUpdate.mockResolvedValue({
    id: "col_1",
    slug: "ny-slug",
    version: 2,
  });
  txProductDelete.mockResolvedValue({ id: "prod_1" });
  txCollectionDelete.mockResolvedValue({ id: "col_1" });
});

// ── updateProduct ─────────────────────────────────────────────

describe("updateProduct — SEO redirect creation", () => {
  it("calls collapseAndCreate with correct args when title changes and slug changes", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({
      id: "prod_1",
      slug: "gammal-slug",
      title: "Gammal titel",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    });
    txProductUpdate.mockResolvedValue({
      id: "prod_1",
      slug: "ny-titel",
      version: 2,
    });

    await updateProduct("prod_1", { title: "Ny titel" });

    expect(collapseAndCreate).toHaveBeenCalledTimes(1);
    const [, args] = collapseAndCreate.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant_t",
      oldPath: "/shop/products/gammal-slug",
      newPath: "/shop/products/ny-titel",
      locale: "sv",
    });
  });

  it("does NOT call collapseAndCreate when title changes but titleToSlug collapses to same slug", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({
      id: "prod_1",
      slug: "foo",
      title: "Foo",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    });
    // Title changes cosmetically (punctuation) but `titleToSlug`
    // produces the same slug — `existing.slug === newSlug`.
    txProductUpdate.mockResolvedValue({
      id: "prod_1",
      slug: "foo",
      version: 2,
    });

    await updateProduct("prod_1", { title: "Foo!" });

    // updateProduct's outer `if (data.title && data.title !== existing.title)`
    // branch enters, but `slug` from `resolveUniqueSlug` will equal
    // existing.slug since titleToSlug("Foo!") → "foo". No redirect.
    expect(collapseAndCreate).not.toHaveBeenCalled();
  });

  it("does NOT call collapseAndCreate when title is unchanged", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({
      id: "prod_1",
      slug: "foo",
      title: "Foo",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    });

    await updateProduct("prod_1", { price: 20000 });

    expect(collapseAndCreate).not.toHaveBeenCalled();
  });

  it("emits seo.redirect.created log on successful rename", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({
      id: "prod_1",
      slug: "gammal",
      title: "Gammal",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    });
    txProductUpdate.mockResolvedValue({
      id: "prod_1",
      slug: "ny",
      version: 2,
    });

    await updateProduct("prod_1", { title: "Ny" });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.redirect.created",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "product",
        entityId: "prod_1",
        oldPath: "/shop/products/gammal",
        newPath: "/shop/products/ny",
        locale: "sv",
      }),
    );
  });
});

// ── updateCollection ──────────────────────────────────────────

describe("updateCollection — SEO redirect creation", () => {
  it("calls collapseAndCreate with product_collection resource type on slug change", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({
      id: "col_1",
      slug: "sommarpaket",
      title: "Sommarpaket",
      version: 1,
      seo: null,
    });
    txCollectionUpdate.mockResolvedValue({
      id: "col_1",
      slug: "vinterpaket",
      version: 2,
    });

    await updateCollection("col_1", { title: "Vinterpaket" });

    expect(collapseAndCreate).toHaveBeenCalledTimes(1);
    const [, args] = collapseAndCreate.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant_t",
      oldPath: "/shop/collections/sommarpaket",
      newPath: "/shop/collections/vinterpaket",
      locale: "sv",
    });
  });

  it("does NOT call collapseAndCreate when slug collapses to the same value", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({
      id: "col_1",
      slug: "foo",
      title: "Foo",
      version: 1,
      seo: null,
    });
    txCollectionUpdate.mockResolvedValue({
      id: "col_1",
      slug: "foo",
      version: 2,
    });

    await updateCollection("col_1", { title: "Foo!" });

    expect(collapseAndCreate).not.toHaveBeenCalled();
  });

  it("does NOT call collapseAndCreate when title field is absent from input", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({
      id: "col_1",
      slug: "foo",
      title: "Foo",
      version: 1,
      seo: null,
    });

    await updateCollection("col_1", { description: "Ny beskrivning" });

    expect(collapseAndCreate).not.toHaveBeenCalled();
  });

  it("emits seo.redirect.created with resourceType product_collection", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({
      id: "col_1",
      slug: "old",
      title: "Old",
      version: 1,
      seo: null,
    });
    txCollectionUpdate.mockResolvedValue({
      id: "col_1",
      slug: "new",
      version: 2,
    });

    await updateCollection("col_1", { title: "New" });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.redirect.created",
      expect.objectContaining({
        resourceType: "product_collection",
        entityId: "col_1",
        oldPath: "/shop/collections/old",
        newPath: "/shop/collections/new",
      }),
    );
  });
});

// ── deleteProduct ─────────────────────────────────────────────

describe("deleteProduct — SEO redirect cleanup", () => {
  it("invokes cleanupRedirectsForDeletedEntity with the product's current path", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({ id: "prod_1", slug: "min-produkt" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(0);

    await deleteProduct("prod_1");

    expect(cleanupRedirectsForDeletedEntity).toHaveBeenCalledTimes(1);
    const [, args] = cleanupRedirectsForDeletedEntity.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant_t",
      entityPath: "/shop/products/min-produkt",
      locale: "sv",
    });
  });

  it("does not log cleanup event when zero redirects were deleted", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({ id: "prod_1", slug: "foo" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(0);

    await deleteProduct("prod_1");

    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.redirect.cleaned_up_on_delete",
      expect.anything(),
    );
  });

  it("logs seo.redirect.cleaned_up_on_delete with redirectsDeleted count when > 0", async () => {
    primeAuth();
    productFindFirst.mockResolvedValue({ id: "prod_1", slug: "foo" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(3);

    await deleteProduct("prod_1");

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.redirect.cleaned_up_on_delete",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "product",
        entityId: "prod_1",
        path: "/shop/products/foo",
        redirectsDeleted: 3,
      }),
    );
  });

  it("skips cleanup entirely when the product blocks delete (orders reference it)", async () => {
    // Guard returns the user error BEFORE the transaction opens —
    // no redirect call should ever fire.
    primeAuth();
    productFindFirst.mockResolvedValue({ id: "prod_1", slug: "foo" });
    orderLineItemCount.mockResolvedValue(2);

    const result = await deleteProduct("prod_1");

    expect(result.ok).toBe(false);
    expect(cleanupRedirectsForDeletedEntity).not.toHaveBeenCalled();
  });
});

// ── deleteCollection ──────────────────────────────────────────

describe("deleteCollection — SEO redirect cleanup", () => {
  it("invokes cleanupRedirectsForDeletedEntity with the collection's current path", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({ id: "col_1", slug: "serien" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(0);

    await deleteCollection("col_1");

    expect(cleanupRedirectsForDeletedEntity).toHaveBeenCalledTimes(1);
    const [, args] = cleanupRedirectsForDeletedEntity.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant_t",
      entityPath: "/shop/collections/serien",
      locale: "sv",
    });
  });

  it("does not log cleanup event when no redirects exist", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({ id: "col_1", slug: "s" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(0);

    await deleteCollection("col_1");

    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.redirect.cleaned_up_on_delete",
      expect.anything(),
    );
  });

  it("logs seo.redirect.cleaned_up_on_delete with resourceType product_collection", async () => {
    primeAuth();
    collectionFindFirst.mockResolvedValue({ id: "col_1", slug: "s" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(5);

    await deleteCollection("col_1");

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.redirect.cleaned_up_on_delete",
      expect.objectContaining({
        resourceType: "product_collection",
        entityId: "col_1",
        path: "/shop/collections/s",
        redirectsDeleted: 5,
      }),
    );
  });
});
