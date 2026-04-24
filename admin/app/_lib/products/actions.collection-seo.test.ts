/**
 * createCollection / updateCollection — SEO save-path tests
 * ═════════════════════════════════════════════════════════
 *
 * Mirrors the Product tests (actions.seo.test.ts) — same merge
 * semantics, same strip-empty behaviour, same log events — just
 * against the collection action surface.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    productCollection: {
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

import { createCollection, updateCollection } from "./actions";

// ── Fixtures ──────────────────────────────────────────────────

function tenantStub(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
  } as unknown as Tenant;
}

type FindFirstMock = typeof prisma.productCollection.findFirst;
type TransactionMock = typeof prisma.$transaction;

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(getCurrentTenant).mockReset();
  vi.mocked(prisma.productCollection.findFirst as FindFirstMock).mockReset();
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
      const fakeCollection = {
        id: "col_new",
        slug: "created",
        version: op === "create" ? 1 : 2,
      };
      await fn({
        productCollection: {
          create: vi.fn(async (args: unknown) => {
            if (op === "create") {
              captured = (args as { data: Record<string, unknown> }).data;
            }
            return fakeCollection;
          }),
          update: vi.fn(async (args: unknown) => {
            if (op === "update") {
              captured = (args as { data: Record<string, unknown> }).data;
            }
            return fakeCollection;
          }),
        },
        productCollectionItem: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        product: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      return fakeCollection;
    },
  );

  return () => captured;
}

// ──────────────────────────────────────────────────────────────

describe("createCollection — SEO branch", () => {
  it("persists the seo field when supplied", async () => {
    primeAuth();
    const read = captureTransaction("create");

    const result = await createCollection({
      title: "Ny produktserie",
      description: "",
      status: "DRAFT",
      productIds: [],
      seo: { title: "SEO-titel", description: "SEO-beskrivning" },
    });

    expect(result.ok).toBe(true);
    const captured = read();
    expect((captured as { seo?: unknown }).seo).toMatchObject({
      title: "SEO-titel",
      description: "SEO-beskrivning",
    });
  });

  it("strips empty-string seo fields before persisting", async () => {
    primeAuth();
    const read = captureTransaction("create");

    await createCollection({
      title: "Ny produktserie",
      description: "",
      status: "DRAFT",
      productIds: [],
      // Merchant opened + typed nothing. strip-empty keeps the row
      // out of the `fieldsChanged` log and out of the stored seo
      // payload when there's nothing merchant-meaningful.
      seo: { title: "", description: "" },
    });

    const captured = read();
    expect(captured).not.toBeNull();
    // The `noindex`/`nofollow` Zod defaults still populate the
    // parsed payload (same as Product) — they don't flow through
    // the stripEmptySeoKeys drop-strings filter. The key
    // `title`/`description` are what the merchant sees & what the
    // strip helper targets.
    const seo = (captured as { seo?: Record<string, unknown> }).seo;
    if (seo !== undefined) {
      expect(JSON.stringify(seo)).not.toContain("\"title\":\"\"");
      expect(JSON.stringify(seo)).not.toContain("\"description\":\"\"");
    }
  });

  it("emits seo.entity.seo_created with fieldsChanged on success", async () => {
    primeAuth();
    captureTransaction("create");

    await createCollection({
      title: "Ny produktserie",
      description: "",
      status: "DRAFT",
      productIds: [],
      seo: { title: "T", description: "D" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_created",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "product_collection",
        entityId: "col_new",
        fieldsChanged: expect.stringContaining("title"),
      }),
    );
  });

  it("does NOT emit seo_created when seo payload is entirely empty", async () => {
    primeAuth();
    captureTransaction("create");

    await createCollection({
      title: "Ny produktserie",
      description: "",
      status: "DRAFT",
      productIds: [],
      seo: { title: "", description: "" },
    });

    const logCalls = vi.mocked(log).mock.calls.filter(
      (c) => c[1] === "seo.entity.seo_created",
    );
    // Either no log fired (stripped payload empty) or log fired but
    // fieldsChanged explicitly excludes title/description.
    for (const call of logCalls) {
      const fields = (
        call[2] as { fieldsChanged?: string } | undefined
      )?.fieldsChanged;
      expect(fields).not.toContain("title");
      expect(fields).not.toContain("description");
    }
  });
});

// ──────────────────────────────────────────────────────────────

describe("updateCollection — SEO branch", () => {
  it("shallow-merges incoming seo over stored entity.seo", async () => {
    primeAuth();
    vi.mocked(prisma.productCollection.findFirst as FindFirstMock).mockResolvedValue({
      id: "col_1",
      slug: "mat-och-dryck",
      title: "Old",
      version: 1,
      seo: {
        title: "Gammal titel",
        description: "Gammal beskrivning",
        // Field the UI doesn't edit in M6.6 — MUST survive.
        ogImageId: "media_existing_1",
      },
    } as unknown as Awaited<ReturnType<FindFirstMock>>);

    const read = captureTransaction("update");

    const result = await updateCollection("col_1", {
      seo: { title: "Ny titel" },
    });

    expect(result.ok).toBe(true);
    const captured = read();
    const merged = (captured as { seo?: Record<string, unknown> })?.seo;
    expect(merged).toMatchObject({
      title: "Ny titel",
      description: "Gammal beskrivning",
      ogImageId: "media_existing_1",
    });
  });

  it("scopes pre-fetch by tenantId + widens select with seo", async () => {
    primeAuth();
    vi.mocked(prisma.productCollection.findFirst as FindFirstMock).mockResolvedValue(
      null,
    );

    await updateCollection("col_1", { seo: { title: "x" } });

    const call = vi.mocked(prisma.productCollection.findFirst).mock.calls[0][0];
    expect(call).toMatchObject({
      where: { id: "col_1", tenantId: "tenant_t" },
      select: { seo: true },
    });
  });

  it("emits seo.entity.seo_updated with the post-strip key set", async () => {
    primeAuth();
    vi.mocked(prisma.productCollection.findFirst as FindFirstMock).mockResolvedValue({
      id: "col_1",
      slug: "mat-och-dryck",
      title: "Old",
      version: 1,
      seo: null,
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    captureTransaction("update");

    await updateCollection("col_1", {
      seo: { title: "Ny", description: "Ny beskrivning" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "product_collection",
        entityId: "col_1",
        fieldsChanged: expect.stringContaining("title"),
      }),
    );
  });

  it("(M6.4) cleared title override doesn't clobber stored value", async () => {
    primeAuth();
    vi.mocked(prisma.productCollection.findFirst as FindFirstMock).mockResolvedValue({
      id: "col_1",
      slug: "mat-och-dryck",
      title: "Old",
      version: 1,
      seo: { title: "Previous SEO title", description: "Prev desc" },
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    const read = captureTransaction("update");

    await updateCollection("col_1", {
      seo: { title: "", description: "   " },
    });

    const merged = (read() as { seo?: Record<string, unknown> })?.seo;
    // Both empties stripped → stored values survive.
    expect(merged).toMatchObject({
      title: "Previous SEO title",
      description: "Prev desc",
    });
  });

  it("skips the seo update entirely when the payload omits `seo`", async () => {
    primeAuth();
    vi.mocked(prisma.productCollection.findFirst as FindFirstMock).mockResolvedValue({
      id: "col_1",
      slug: "mat-och-dryck",
      title: "Old",
      version: 1,
      seo: { title: "Keep" },
    } as unknown as Awaited<ReturnType<FindFirstMock>>);
    const read = captureTransaction("update");

    await updateCollection("col_1", { title: "Bara titel" });

    const captured = read();
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
