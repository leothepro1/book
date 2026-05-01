/**
 * updateAccommodation — server action tests
 * ═════════════════════════════════════════
 *
 * Focus: the SEO override save path introduced in M6.2. Other update
 * surfaces (facilities, media, highlights, bed configs, category
 * membership) are covered by the existing flows — we assert only that
 * they aren't disturbed by the seo branch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (callback: unknown) => {
      const fn = callback as (tx: unknown) => Promise<unknown>;
      // Mirror Prisma's interactive-tx shape — pass the same
      // mocked client as the transaction.
      return fn({
        accommodation: { update: vi.fn() },
        accommodationFacility: {
          deleteMany: vi.fn(),
          updateMany: vi.fn(),
          createMany: vi.fn(),
        },
        bedConfiguration: { deleteMany: vi.fn(), createMany: vi.fn() },
        accommodationMedia: { deleteMany: vi.fn(), createMany: vi.fn() },
        accommodationHighlight: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        accommodationCategoryItem: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        accommodationCategory: { findMany: vi.fn().mockResolvedValue([]) },
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
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import type { Tenant } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";

import { updateAccommodation } from "./actions";

// ── Fixtures ──────────────────────────────────────────────────

function tenantStub(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
  } as unknown as Tenant;
}

type FindFirstMock = typeof prisma.accommodation.findFirst;
type TransactionMock = typeof prisma.$transaction;

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(getCurrentTenant).mockReset();
  vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockReset();
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

// ──────────────────────────────────────────────────────────────

describe("updateAccommodation — SEO merge semantics", () => {
  it("merges incoming seo shallow over the stored entity.seo", async () => {
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      {
        id: "acc_1",
        seo: {
          title: "Gammal titel",
          description: "Gammal beskrivning",
          // A field the UI doesn't edit in Batch 2 — MUST survive
          // the save.
          ogImageId: "media_existing_1",
        },
      } as unknown as Awaited<ReturnType<FindFirstMock>>,
    );

    // Capture the data passed to tx.accommodation.update.
    let capturedData: Record<string, unknown> | null = null;
    vi.mocked(prisma.$transaction as TransactionMock).mockImplementationOnce(
      async (callback: unknown) => {
        const fn = callback as (tx: unknown) => Promise<unknown>;
        await fn({
          accommodation: {
            update: vi.fn(async (args: unknown) => {
              capturedData = (args as { data: Record<string, unknown> }).data;
              return null;
            }),
          },
          accommodationFacility: { deleteMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
          bedConfiguration: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationMedia: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationHighlight: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategoryItem: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategory: { findMany: vi.fn().mockResolvedValue([]) },
        });
        return null;
      },
    );

    const result = await updateAccommodation("acc_1", {
      seo: { title: "Ny titel" },
    });

    expect(result).toEqual({ ok: true, data: { id: "acc_1" } });
    expect(capturedData).not.toBeNull();
    const merged = (capturedData as unknown as { seo?: Record<string, unknown> })?.seo;
    // Incoming override wins.
    expect(merged).toMatchObject({ title: "Ny titel" });
    // Untouched stored fields survive.
    expect(merged).toMatchObject({
      description: "Gammal beskrivning",
      ogImageId: "media_existing_1",
    });
  });

  it("emits seo.entity.seo_updated with the set of changed keys", async () => {
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      { id: "acc_1", seo: null } as unknown as Awaited<
        ReturnType<FindFirstMock>
      >,
    );

    await updateAccommodation("acc_1", {
      seo: { title: "Ny", description: "Ny beskrivning" },
    });

    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation",
        entityId: "acc_1",
        fieldsChanged: expect.stringContaining("title"),
      }),
    );
  });

  it("rejects invalid seo payload with a typed error + seo.entity.seo_invalid log", async () => {
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      { id: "acc_1", seo: null } as unknown as Awaited<
        ReturnType<FindFirstMock>
      >,
    );

    const result = await updateAccommodation("acc_1", {
      // title exceeds SeoMetadataSchema's 255-char cap.
      seo: { title: "a".repeat(500) },
    });

    expect(result).toEqual({ ok: false, error: "Ogiltig SEO-data" });
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.entity.seo_invalid",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation",
        entityId: "acc_1",
      }),
    );
  });

  it("scopes the ownership check by tenantId — never trusts the id alone", async () => {
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      null,
    );

    const result = await updateAccommodation("acc_1", { seo: { title: "x" } });

    expect(result).toEqual({ ok: false, error: "Boendet hittades inte" });
    const call = vi.mocked(prisma.accommodation.findFirst).mock.calls[0][0];
    expect(call).toMatchObject({
      where: { id: "acc_1", tenantId: "tenant_t" },
    });
  });

  it("rejects anonymous callers before touching the DB", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      error: "Forbidden",
    });

    const result = await updateAccommodation("acc_1", { seo: { title: "x" } });

    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(prisma.accommodation.findFirst).not.toHaveBeenCalled();
  });

  it("skips the seo update entirely when the payload omits `seo`", async () => {
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      { id: "acc_1", seo: { title: "Keep" } } as unknown as Awaited<
        ReturnType<FindFirstMock>
      >,
    );

    let capturedData: Record<string, unknown> | null = null;
    vi.mocked(prisma.$transaction as TransactionMock).mockImplementationOnce(
      async (callback: unknown) => {
        const fn = callback as (tx: unknown) => Promise<unknown>;
        await fn({
          accommodation: {
            update: vi.fn(async (args: unknown) => {
              capturedData = (args as { data: Record<string, unknown> }).data;
              return null;
            }),
          },
          accommodationFacility: { deleteMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
          bedConfiguration: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationMedia: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationHighlight: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategoryItem: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategory: { findMany: vi.fn().mockResolvedValue([]) },
        });
        return null;
      },
    );

    await updateAccommodation("acc_1", { nameOverride: "Nytt namn" });

    expect(capturedData).not.toBeNull();
    expect(
      Object.keys(capturedData ?? {}).includes("seo"),
    ).toBe(false);
    expect(log).not.toHaveBeenCalledWith(
      "info",
      "seo.entity.seo_updated",
      expect.anything(),
    );
  });

  it("strips `undefined` values from the merged seo before handing to Prisma", async () => {
    // Zod .partial() keeps optional fields as undefined in the
    // parsed object; Prisma's InputJsonValue rejects `undefined`
    // inside objects. The action's JSON round-trip must clean them.
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      {
        id: "acc_1",
        seo: { title: "Gammal", description: "Gammal" },
      } as unknown as Awaited<ReturnType<FindFirstMock>>,
    );

    let capturedData: Record<string, unknown> | null = null;
    vi.mocked(prisma.$transaction as TransactionMock).mockImplementationOnce(
      async (callback: unknown) => {
        const fn = callback as (tx: unknown) => Promise<unknown>;
        await fn({
          accommodation: {
            update: vi.fn(async (args: unknown) => {
              capturedData = (args as { data: Record<string, unknown> }).data;
              return null;
            }),
          },
          accommodationFacility: { deleteMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
          bedConfiguration: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationMedia: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationHighlight: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategoryItem: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategory: { findMany: vi.fn().mockResolvedValue([]) },
        });
        return null;
      },
    );

    await updateAccommodation("acc_1", {
      seo: { title: "Ny" /* description absent → undefined after parse */ },
    });

    expect(capturedData).not.toBeNull();
    const seoValue = (capturedData as unknown as { seo?: unknown }).seo;
    // Prisma's InputJsonValue doesn't allow `undefined` fields —
    // the serialized value must round-trip cleanly.
    const stringified = JSON.stringify(seoValue);
    expect(stringified).not.toContain("undefined");
  });

  it("(M6.4) strips empty-string overrides before persisting — cleared title doesn't clobber stored", async () => {
    // Merchant typed a title, saved, then typed the override blank
    // and saved again. The second save must NOT persist
    // `title: ""` — instead it should leave the stored title
    // untouched (present in existing seo).
    primeAuth();
    vi.mocked(prisma.accommodation.findFirst as FindFirstMock).mockResolvedValue(
      {
        id: "acc_1",
        seo: {
          title: "Previous title",
          description: "Previous desc",
        },
      } as unknown as Awaited<ReturnType<FindFirstMock>>,
    );

    let capturedData: Record<string, unknown> | null = null;
    vi.mocked(prisma.$transaction as TransactionMock).mockImplementationOnce(
      async (callback: unknown) => {
        const fn = callback as (tx: unknown) => Promise<unknown>;
        await fn({
          accommodation: {
            update: vi.fn(async (args: unknown) => {
              capturedData = (args as { data: Record<string, unknown> }).data;
              return null;
            }),
          },
          accommodationFacility: { deleteMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
          bedConfiguration: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationMedia: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationHighlight: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategoryItem: { deleteMany: vi.fn(), createMany: vi.fn() },
          accommodationCategory: { findMany: vi.fn().mockResolvedValue([]) },
        });
        return null;
      },
    );

    await updateAccommodation("acc_1", {
      // "Cleared" override — merchant deleted the title field.
      seo: { title: "", description: "New description" },
    });

    expect(capturedData).not.toBeNull();
    const merged = (capturedData as unknown as { seo?: Record<string, unknown> })?.seo;
    // "" is stripped; stored title ("Previous title") survives;
    // the non-empty description override wins.
    expect(merged).toMatchObject({
      title: "Previous title",
      description: "New description",
    });
    expect(JSON.stringify(merged)).not.toContain("\"title\":\"\"");
  });
});
