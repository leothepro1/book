/**
 * updateAccommodationCategory / deleteAccommodationCategory
 * — SEO redirect call-site tests
 * ═════════════════════════════════════════════════════════
 *
 * Scope: verifies the server actions invoke collapseAndCreate /
 * cleanupRedirectsForDeletedEntity with correct args. The
 * helpers' own internals are covered by writes.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const collapseAndCreate = vi.fn();
const cleanupRedirectsForDeletedEntity = vi.fn();
const getTenantDefaultLocale = vi.fn();

vi.mock("@/app/_lib/seo/redirects", () => ({
  buildRedirectPath: (resourceType: string, slug: string) =>
    resourceType === "accommodation_category"
      ? `/stays/categories/${slug}`
      : null,
  collapseAndCreate: (...a: unknown[]) => collapseAndCreate(...a),
  cleanupRedirectsForDeletedEntity: (...a: unknown[]) =>
    cleanupRedirectsForDeletedEntity(...a),
  getTenantDefaultLocale: (...a: unknown[]) => getTenantDefaultLocale(...a),
}));

const categoryFindFirst = vi.fn();
const categoryFindUnique = vi.fn();
const txCategoryUpdate = vi.fn();
const txCategoryDelete = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodationCategory: {
      findFirst: (...a: unknown[]) => categoryFindFirst(...a),
      findUnique: (...a: unknown[]) => categoryFindUnique(...a),
    },
    $transaction: vi.fn(async (callback: unknown) => {
      const fn = callback as (tx: unknown) => Promise<unknown>;
      return fn({
        accommodationCategory: {
          update: (...a: unknown[]) => txCategoryUpdate(...a),
          delete: (...a: unknown[]) => txCategoryDelete(...a),
        },
        accommodationCategoryItem: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        accommodation: {
          findMany: vi.fn().mockResolvedValue([]),
        },
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

import type { Tenant } from "@prisma/client";
import { log } from "@/app/_lib/logger";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import {
  updateAccommodationCategory,
  deleteAccommodationCategory,
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
  categoryFindUnique.mockResolvedValue(null);
  txCategoryUpdate.mockResolvedValue({
    id: "cat_1",
    slug: "ny",
    version: 2,
  });
  txCategoryDelete.mockResolvedValue({ id: "cat_1" });
});

describe("updateAccommodationCategory — SEO redirect creation", () => {
  it("calls collapseAndCreate with accommodation_category resource type on slug change", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({
      id: "cat_1",
      slug: "stugor",
      title: "Stugor",
      version: 1,
      seo: null,
    });
    txCategoryUpdate.mockResolvedValue({
      id: "cat_1",
      slug: "stugor-premium",
      version: 2,
    });

    await updateAccommodationCategory("cat_1", { title: "Stugor Premium" });

    expect(collapseAndCreate).toHaveBeenCalledTimes(1);
    const [, args] = collapseAndCreate.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant_t",
      oldPath: "/stays/categories/stugor",
      newPath: "/stays/categories/stugor-premium",
      locale: "sv",
    });
  });

  it("does NOT call collapseAndCreate when titleToSlug collapses to the same slug", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({
      id: "cat_1",
      slug: "foo",
      title: "Foo",
      version: 1,
      seo: null,
    });
    txCategoryUpdate.mockResolvedValue({
      id: "cat_1",
      slug: "foo",
      version: 2,
    });

    await updateAccommodationCategory("cat_1", { title: "Foo!" });

    expect(collapseAndCreate).not.toHaveBeenCalled();
  });

  it("does NOT call collapseAndCreate when title is absent from input", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({
      id: "cat_1",
      slug: "foo",
      title: "Foo",
      version: 1,
      seo: null,
    });

    await updateAccommodationCategory("cat_1", {
      description: "Ny beskrivning",
    });

    expect(collapseAndCreate).not.toHaveBeenCalled();
  });

  it("emits seo.redirect.created log on successful rename", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({
      id: "cat_1",
      slug: "old",
      title: "Old",
      version: 1,
      seo: null,
    });
    txCategoryUpdate.mockResolvedValue({
      id: "cat_1",
      slug: "new",
      version: 2,
    });

    await updateAccommodationCategory("cat_1", { title: "New" });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.redirect.created",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation_category",
        entityId: "cat_1",
        oldPath: "/stays/categories/old",
        newPath: "/stays/categories/new",
        locale: "sv",
      }),
    );
  });
});

describe("deleteAccommodationCategory — SEO redirect cleanup", () => {
  it("invokes cleanupRedirectsForDeletedEntity with the category's current path", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({ id: "cat_1", slug: "stugor" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(0);

    await deleteAccommodationCategory("cat_1");

    expect(cleanupRedirectsForDeletedEntity).toHaveBeenCalledTimes(1);
    const [, args] = cleanupRedirectsForDeletedEntity.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant_t",
      entityPath: "/stays/categories/stugor",
      locale: "sv",
    });
  });

  it("does not log cleanup event when zero redirects were deleted", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({ id: "cat_1", slug: "s" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(0);

    await deleteAccommodationCategory("cat_1");

    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.redirect.cleaned_up_on_delete",
      expect.anything(),
    );
  });

  it("logs seo.redirect.cleaned_up_on_delete with redirectsDeleted count", async () => {
    primeAuth();
    categoryFindFirst.mockResolvedValue({ id: "cat_1", slug: "stugor" });
    cleanupRedirectsForDeletedEntity.mockResolvedValue(7);

    await deleteAccommodationCategory("cat_1");

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.redirect.cleaned_up_on_delete",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation_category",
        entityId: "cat_1",
        path: "/stays/categories/stugor",
        redirectsDeleted: 7,
      }),
    );
  });
});
