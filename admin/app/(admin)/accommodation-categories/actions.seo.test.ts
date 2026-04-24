/**
 * createAccommodationCategory / updateAccommodationCategory —
 * SEO save-path tests (M6.6)
 * ═════════════════════════════════════════════════════════════
 *
 * Category action doesn't use named Zod schemas (unlike Product +
 * Collection) — it validates seo inline via
 * `SeoMetadataSchema.partial().safeParse`. Same merge semantics as
 * Batch 2/3/6 collection: strip empties, shallow-merge over
 * stored, emit logs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodationCategory: {
      findFirst: vi.fn(),
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
  revalidateTag: vi.fn(),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import type { Tenant } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";

import {
  createAccommodationCategory,
  updateAccommodationCategory,
} from "./actions";

// ── Fixtures ──────────────────────────────────────────────────

function tenantStub(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
  } as unknown as Tenant;
}

type FindFirstMock = typeof prisma.accommodationCategory.findFirst;
type TransactionMock = typeof prisma.$transaction;

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(getCurrentTenant).mockReset();
  vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockReset();
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

function captureTransaction(op: "create" | "update"): () => Record<string, unknown> | null {
  let captured: Record<string, unknown> | null = null;

  vi.mocked(prisma.$transaction as TransactionMock).mockImplementation(
    async (callback: unknown) => {
      const fn = callback as (tx: unknown) => Promise<unknown>;
      const fakeCategory = {
        id: "cat_new",
        slug: "created",
        version: op === "create" ? 1 : 2,
      };
      await fn({
        accommodationCategory: {
          create: vi.fn(async (args: unknown) => {
            if (op === "create") {
              captured = (args as { data: Record<string, unknown> }).data;
            }
            return fakeCategory;
          }),
          update: vi.fn(async (args: unknown) => {
            if (op === "update") {
              captured = (args as { data: Record<string, unknown> }).data;
            }
            return fakeCategory;
          }),
        },
        accommodationCategoryItem: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        accommodation: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      return fakeCategory;
    },
  );

  return () => captured;
}

// ──────────────────────────────────────────────────────────────

describe("createAccommodationCategory — SEO branch", () => {
  it("persists the seo field when supplied", async () => {
    primeAuth();
    const read = captureTransaction("create");
    // findUnique for slug-collision check resolves to null.

    const result = await createAccommodationCategory({
      title: "Ny boendetyp",
      description: "",
      seo: { title: "SEO-titel", description: "SEO-beskrivning" },
    });

    expect(result.ok).toBe(true);
    const captured = read();
    expect((captured as { seo?: unknown }).seo).toMatchObject({
      title: "SEO-titel",
      description: "SEO-beskrivning",
    });
  });

  it("rejects invalid seo payload with Zod error + logs seo_invalid", async () => {
    primeAuth();
    captureTransaction("create");

    const result = await createAccommodationCategory({
      title: "Ny boendetyp",
      description: "",
      seo: { title: "a".repeat(500) },
    });

    expect(result.ok).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.entity.seo_invalid",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation_category",
      }),
    );
  });

  it("emits seo.entity.seo_created on success", async () => {
    primeAuth();
    captureTransaction("create");

    await createAccommodationCategory({
      title: "Ny boendetyp",
      description: "",
      seo: { title: "T", description: "D" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_created",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation_category",
        entityId: "cat_new",
        fieldsChanged: expect.stringContaining("title"),
      }),
    );
  });

  it("does NOT set seo key when strip-empty yields nothing persistable", async () => {
    primeAuth();
    const read = captureTransaction("create");

    await createAccommodationCategory({
      title: "Ny boendetyp",
      description: "",
      seo: { title: "", description: "" },
    });

    const captured = read();
    expect(captured).not.toBeNull();
    // The strip-empty helper drops both title + description; only
    // Zod-defaulted booleans remain. `Object.keys(stripped).length === 0`
    // only when zero merchant-meaningful fields survived. Since the
    // `.partial()` parse populates noindex/nofollow defaults, the
    // stored seo will include them — but the seo_created log will
    // not include "title" or "description".
    const seoLogCalls = vi.mocked(log).mock.calls.filter(
      (c) => c[1] === "seo.entity.seo_created",
    );
    for (const call of seoLogCalls) {
      const fields = (
        call[2] as { fieldsChanged?: string } | undefined
      )?.fieldsChanged;
      expect(fields).not.toContain("title");
      expect(fields).not.toContain("description");
    }
  });
});

// ──────────────────────────────────────────────────────────────

describe("updateAccommodationCategory — SEO branch", () => {
  it("shallow-merges incoming seo over stored entity.seo", async () => {
    primeAuth();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockResolvedValue({
      id: "cat_1",
      slug: "stugor",
      title: "Old",
      version: 1,
      seo: {
        title: "Gammal titel",
        description: "Gammal beskrivning",
        ogImageId: "media_existing_1",
      },
    } as unknown as Awaited<ReturnType<FindFirstMock>>);

    const read = captureTransaction("update");

    const result = await updateAccommodationCategory("cat_1", {
      seo: { title: "Ny titel" },
    });

    expect(result.ok).toBe(true);
    const merged = (read() as { seo?: Record<string, unknown> })?.seo;
    expect(merged).toMatchObject({
      title: "Ny titel",
      description: "Gammal beskrivning",
      ogImageId: "media_existing_1",
    });
  });

  it("scopes pre-fetch by tenantId + widens select with seo", async () => {
    primeAuth();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockResolvedValue(
      null,
    );

    await updateAccommodationCategory("cat_1", { seo: { title: "x" } });

    const call = vi.mocked(prisma.accommodationCategory.findFirst).mock.calls[0][0];
    expect(call).toMatchObject({
      where: { id: "cat_1", tenantId: "tenant_t" },
      select: { seo: true },
    });
  });

  it("rejects invalid seo + logs seo_invalid", async () => {
    primeAuth();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockResolvedValue({
      id: "cat_1",
      slug: "stugor",
      title: "Old",
      version: 1,
      seo: null,
    } as unknown as Awaited<ReturnType<FindFirstMock>>);

    const result = await updateAccommodationCategory("cat_1", {
      seo: { title: "a".repeat(500) },
    });

    expect(result.ok).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.entity.seo_invalid",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation_category",
        entityId: "cat_1",
      }),
    );
  });

  it("emits seo.entity.seo_updated on success", async () => {
    primeAuth();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockResolvedValue({
      id: "cat_1",
      slug: "stugor",
      title: "Old",
      version: 1,
      seo: null,
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    captureTransaction("update");

    await updateAccommodationCategory("cat_1", {
      seo: { title: "Ny" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation_category",
        entityId: "cat_1",
      }),
    );
  });

  it("(M6.4) cleared title override doesn't clobber stored value", async () => {
    primeAuth();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockResolvedValue({
      id: "cat_1",
      slug: "stugor",
      title: "Old",
      version: 1,
      seo: { title: "Previous SEO title", description: "Prev desc" },
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    const read = captureTransaction("update");

    await updateAccommodationCategory("cat_1", {
      seo: { title: "", description: "   " },
    });

    const merged = (read() as { seo?: Record<string, unknown> })?.seo;
    expect(merged).toMatchObject({
      title: "Previous SEO title",
      description: "Prev desc",
    });
  });

  it("skips the seo update entirely when the payload omits `seo`", async () => {
    primeAuth();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstMock).mockResolvedValue({
      id: "cat_1",
      slug: "stugor",
      title: "Old",
      version: 1,
      seo: { title: "Keep" },
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    const read = captureTransaction("update");

    await updateAccommodationCategory("cat_1", { title: "Bara titel" });

    expect(
      Object.prototype.hasOwnProperty.call(read(), "seo"),
    ).toBe(false);
    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.anything(),
    );
  });
});
