/**
 * createProduct / updateProduct — SEO save-path tests
 * ═══════════════════════════════════════════════════
 *
 * M6.3 integration: merchants edit seo in SearchListingEditor, the
 * form submits it alongside title/price/etc., and these actions
 * persist it via SeoMetadataSchema-validated JSON. Scope here is
 * the SEO branch only; other CRUD surfaces (media, variants,
 * options, collections, tags) are covered by the existing suite.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(),
      // resolveUniqueSlug (update path on title change) uses findUnique
      // to check slug collisions. Default null = "no collision"; the
      // `create` path never reaches here because our tests keep the
      // title unchanged or tolerate a first-candidate match.
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(),
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
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import type { Tenant } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";

import { createProduct, updateProduct } from "./actions";

// ── Fixtures ──────────────────────────────────────────────────

function tenantStub(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
  } as unknown as Tenant;
}

type FindFirstMock = typeof prisma.product.findFirst;
type TransactionMock = typeof prisma.$transaction;

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(getCurrentTenant).mockReset();
  vi.mocked(prisma.product.findFirst as FindFirstMock).mockReset();
  vi.mocked(prisma.$transaction as TransactionMock).mockReset();
  vi.mocked(log).mockReset();
});

function primeAuth(): void {
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true });
  vi.mocked(getCurrentTenant).mockResolvedValue({
    tenant: tenantStub(),
    clerkUserId: "u_1",
    clerkOrgId: "org_1",
  });
}

/**
 * Install a mocked `prisma.$transaction` whose callback captures
 * the `tx.product.create` / `tx.product.update` `data` payload so
 * tests can assert what was persisted.
 */
function captureTransaction(op: "create" | "update"): () => Record<string, unknown> | null {
  let captured: Record<string, unknown> | null = null;

  vi.mocked(prisma.$transaction as TransactionMock).mockImplementation(
    async (callback: unknown) => {
      const fn = callback as (tx: unknown) => Promise<unknown>;
      const fakeProduct = {
        id: "prod_new",
        slug: "created",
        version: op === "create" ? 1 : 2,
      };
      await fn({
        product: {
          create: vi.fn(async (args: unknown) => {
            if (op === "create") {
              captured = (args as { data: Record<string, unknown> }).data;
            }
            return fakeProduct;
          }),
          update: vi.fn(async (args: unknown) => {
            if (op === "update") {
              captured = (args as { data: Record<string, unknown> }).data;
            }
            return fakeProduct;
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        productMedia: { createMany: vi.fn() },
        productOption: { deleteMany: vi.fn(), createMany: vi.fn() },
        productVariant: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        productCollection: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        productCollectionItem: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        productTag: { upsert: vi.fn().mockResolvedValue({ id: "tag_1" }) },
        productTagItem: {
          deleteMany: vi.fn(),
          create: vi.fn(() => ({ catch: () => {} })),
        },
        priceChange: { create: vi.fn() },
        inventoryChange: { create: vi.fn() },
      });
      return fakeProduct;
    },
  );

  return () => captured;
}

// ──────────────────────────────────────────────────────────────

describe("createProduct — SEO branch", () => {
  it("persists the seo field when supplied", async () => {
    primeAuth();
    const read = captureTransaction("create");

    const result = await createProduct({
      title: "Ny produkt",
      description: "",
      status: "DRAFT",
      price: 0,
      currency: "SEK",
      taxable: true,
      trackInventory: false,
      inventoryQuantity: 0,
      continueSellingWhenOutOfStock: false,
      media: [],
      options: [],
      variants: [],
      collectionIds: [],
      tags: [],
      seo: { title: "SEO-titel", description: "SEO-beskrivning" },
    });

    expect(result.ok).toBe(true);
    const captured = read();
    expect(captured).not.toBeNull();
    // Merchant-sent fields land verbatim. `noindex`/`nofollow` appear
    // with their schema defaults because `.partial()` over a field
    // with `.default(false)` fires the default — matches Batch 2
    // semantics. Use toMatchObject so the assertion stays focused on
    // the explicitly-sent keys.
    expect((captured as { seo?: unknown }).seo).toMatchObject({
      title: "SEO-titel",
      description: "SEO-beskrivning",
    });
  });

  it("does NOT set the seo column when the field is absent", async () => {
    primeAuth();
    const read = captureTransaction("create");

    await createProduct({
      title: "Ny produkt",
      description: "",
      status: "DRAFT",
      price: 0,
      currency: "SEK",
      taxable: true,
      trackInventory: false,
      inventoryQuantity: 0,
      continueSellingWhenOutOfStock: false,
      media: [],
      options: [],
      variants: [],
      collectionIds: [],
      tags: [],
    });

    const captured = read();
    expect(captured).not.toBeNull();
    // Absence: the spread `...(seoJson !== null && { seo: ... })`
    // skips the key entirely, so Prisma writes the DB default
    // (null) rather than an empty object.
    expect(
      Object.prototype.hasOwnProperty.call(captured, "seo"),
    ).toBe(false);
  });

  it("rejects invalid seo with Zod validation error + no transaction", async () => {
    primeAuth();
    captureTransaction("create");

    const result = await createProduct({
      title: "Ny produkt",
      description: "",
      status: "DRAFT",
      price: 0,
      currency: "SEK",
      taxable: true,
      trackInventory: false,
      inventoryQuantity: 0,
      continueSellingWhenOutOfStock: false,
      media: [],
      options: [],
      variants: [],
      collectionIds: [],
      tags: [],
      // title exceeds SeoMetadataSchema's 255-char cap.
      seo: { title: "a".repeat(500) } as never,
    });

    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("emits seo.entity.seo_created with the set of changed keys", async () => {
    primeAuth();
    captureTransaction("create");

    await createProduct({
      title: "Ny produkt",
      description: "",
      status: "DRAFT",
      price: 0,
      currency: "SEK",
      taxable: true,
      trackInventory: false,
      inventoryQuantity: 0,
      continueSellingWhenOutOfStock: false,
      media: [],
      options: [],
      variants: [],
      collectionIds: [],
      tags: [],
      seo: { title: "T", description: "D" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_created",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "product",
        entityId: "prod_new",
        fieldsChanged: expect.stringContaining("title"),
      }),
    );
  });

  it("does NOT emit seo_created when no seo field was supplied", async () => {
    primeAuth();
    captureTransaction("create");

    await createProduct({
      title: "Ny produkt",
      description: "",
      status: "DRAFT",
      price: 0,
      currency: "SEK",
      taxable: true,
      trackInventory: false,
      inventoryQuantity: 0,
      continueSellingWhenOutOfStock: false,
      media: [],
      options: [],
      variants: [],
      collectionIds: [],
      tags: [],
    });

    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_created",
      expect.anything(),
    );
  });
});

// ──────────────────────────────────────────────────────────────

describe("updateProduct — SEO branch", () => {
  it("shallow-merges incoming seo over stored entity.seo — untouched keys survive", async () => {
    primeAuth();
    vi.mocked(prisma.product.findFirst as FindFirstMock).mockResolvedValue({
      id: "prod_1",
      slug: "frukost-buffe",
      title: "Old",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: {
        title: "Gammal titel",
        description: "Gammal beskrivning",
        // Field the UI doesn't edit in Batch 3 — MUST survive.
        ogImageId: "media_existing_1",
      },
      options: [],
    } as unknown as Awaited<ReturnType<FindFirstMock>>);

    const read = captureTransaction("update");

    const result = await updateProduct("prod_1", {
      seo: { title: "Ny titel" },
    });

    expect(result.ok).toBe(true);
    const captured = read();
    expect(captured).not.toBeNull();
    const merged = (captured as { seo?: Record<string, unknown> })?.seo;
    expect(merged).toMatchObject({
      title: "Ny titel",
      description: "Gammal beskrivning",
      ogImageId: "media_existing_1",
    });
  });

  it("handles the first-write case where stored seo is null", async () => {
    primeAuth();
    vi.mocked(prisma.product.findFirst as FindFirstMock).mockResolvedValue({
      id: "prod_1",
      slug: "frukost-buffe",
      title: "Old",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    } as unknown as Awaited<ReturnType<FindFirstMock>>);

    const read = captureTransaction("update");

    const result = await updateProduct("prod_1", {
      seo: { title: "Första SEO-titeln" },
    });

    expect(result.ok).toBe(true);
    const captured = read();
    const merged = (captured as { seo?: Record<string, unknown> })?.seo;
    // The merchant-sent title survives verbatim. `noindex`/`nofollow`
    // appear with their schema defaults because Zod `.partial()` over
    // a field with `.default(false)` fires the default — same
    // behaviour as Batch 2's accommodations merge. The Batch 2+
    // `noindex` UI work will revisit this if a merchant-set
    // `noindex: true` on an existing row needs to survive a
    // title-only save.
    expect(merged).toMatchObject({ title: "Första SEO-titeln" });
  });

  it("rejects invalid seo payload via Zod — no transaction runs", async () => {
    primeAuth();
    vi.mocked(prisma.product.findFirst as FindFirstMock).mockResolvedValue({
      id: "prod_1",
      slug: "frukost-buffe",
      title: "Old",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    captureTransaction("update");

    const result = await updateProduct("prod_1", {
      seo: { title: "a".repeat(500) } as never,
    });

    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("scopes the pre-fetch by tenantId — never trusts id alone", async () => {
    primeAuth();
    vi.mocked(prisma.product.findFirst as FindFirstMock).mockResolvedValue(
      null,
    );

    const result = await updateProduct("prod_1", {
      seo: { title: "x" },
    });

    expect(result.ok).toBe(false);
    const call = vi.mocked(prisma.product.findFirst).mock.calls[0][0];
    expect(call).toMatchObject({
      where: { id: "prod_1", tenantId: "tenant_t" },
    });
    // The widened select picks up `seo` for the merge.
    expect(call).toMatchObject({ select: { seo: true } });
  });

  it("emits seo.entity.seo_updated with the set of changed keys", async () => {
    primeAuth();
    vi.mocked(prisma.product.findFirst as FindFirstMock).mockResolvedValue({
      id: "prod_1",
      slug: "frukost-buffe",
      title: "Old",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: null,
      options: [],
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    captureTransaction("update");

    await updateProduct("prod_1", {
      seo: { title: "Ny", description: "Ny beskrivning" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "product",
        entityId: "prod_1",
        fieldsChanged: expect.stringContaining("title"),
      }),
    );
  });

  it("skips the seo update entirely when the payload omits `seo`", async () => {
    primeAuth();
    vi.mocked(prisma.product.findFirst as FindFirstMock).mockResolvedValue({
      id: "prod_1",
      slug: "frukost-buffe",
      title: "Old",
      version: 1,
      price: 10000,
      currency: "SEK",
      productType: "STANDARD",
      seo: { title: "Keep" },
      options: [],
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    const read = captureTransaction("update");

    await updateProduct("prod_1", { title: "Bara titel" });

    const captured = read();
    expect(captured).not.toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(captured, "seo"),
    ).toBe(false);
    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.anything(),
    );
  });
});
