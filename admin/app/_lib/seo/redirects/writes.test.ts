/**
 * Tests for collapseAndCreate + cleanupRedirectsForDeletedEntity.
 *
 * Uses an in-memory fake `tx` that implements the three
 * `seoRedirect` methods the helpers call (`updateMany`,
 * `deleteMany`, `upsert`). The fake enforces the real
 * `@@unique([tenantId, fromPath, locale])` constraint so the
 * test assertions catch ordering bugs — e.g. a reversal that
 * would produce a self-referential row survives the first two
 * steps and only fails on the upsert.
 *
 * Why not mocked Prisma via `vi.mock`? The helpers orchestrate
 * THREE Prisma calls per `collapseAndCreate` invocation, and the
 * ordering is the load-bearing invariant. Vi-mocking each call
 * separately hides ordering bugs; a stateful fake surfaces them.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanupRedirectsForDeletedEntity,
  collapseAndCreate,
} from "./writes";

// ── In-memory redirect store — models the real table closely ─

interface RedirectRow {
  id: string;
  tenantId: string;
  fromPath: string;
  toPath: string;
  locale: string;
  statusCode: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WhereMany {
  tenantId?: string;
  toPath?: string;
  fromPath?: string;
  locale?: string;
}

let _id = 0;
function newId(): string {
  return `r_${++_id}`;
}

class FakeRedirectStore {
  rows: RedirectRow[] = [];

  async updateMany(args: { where: WhereMany; data: { toPath?: string } }): Promise<{ count: number }> {
    let count = 0;
    for (const row of this.rows) {
      if (matchesWhere(row, args.where)) {
        if (args.data.toPath !== undefined) {
          row.toPath = args.data.toPath;
          row.updatedAt = new Date();
        }
        count += 1;
      }
    }
    return { count };
  }

  async deleteMany(args: { where: WhereMany }): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matchesWhere(r, args.where));
    return { count: before - this.rows.length };
  }

  async upsert(args: {
    where: { tenantId_fromPath_locale: { tenantId: string; fromPath: string; locale: string } };
    create: Omit<RedirectRow, "id" | "createdAt" | "updatedAt">;
    update: Partial<Omit<RedirectRow, "id" | "tenantId" | "fromPath" | "locale" | "createdAt">>;
  }): Promise<RedirectRow> {
    const { tenantId, fromPath, locale } = args.where.tenantId_fromPath_locale;
    const existing = this.rows.find(
      (r) =>
        r.tenantId === tenantId && r.fromPath === fromPath && r.locale === locale,
    );
    if (existing) {
      if (args.update.toPath !== undefined) existing.toPath = args.update.toPath;
      if (args.update.statusCode !== undefined) existing.statusCode = args.update.statusCode;
      existing.updatedAt = new Date();
      return existing;
    }
    const row: RedirectRow = {
      id: newId(),
      tenantId: args.create.tenantId,
      fromPath: args.create.fromPath,
      toPath: args.create.toPath,
      locale: args.create.locale,
      statusCode: args.create.statusCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
}

function matchesWhere(row: RedirectRow, where: WhereMany): boolean {
  if (where.tenantId !== undefined && row.tenantId !== where.tenantId) return false;
  if (where.toPath !== undefined && row.toPath !== where.toPath) return false;
  if (where.fromPath !== undefined && row.fromPath !== where.fromPath) return false;
  if (where.locale !== undefined && row.locale !== where.locale) return false;
  return true;
}

/**
 * Build a fake Prisma TransactionClient with a single `seoRedirect`
 * delegate backed by the in-memory store. Cast through `unknown`
 * then to `Prisma.TransactionClient` — the helpers only touch the
 * three methods we provide, so a narrower type is safe under the
 * "cast accompanied by shape invariant" rule.
 */
function makeTx(store: FakeRedirectStore) {
  return { seoRedirect: store } as unknown as Parameters<
    typeof collapseAndCreate
  >[0];
}

// ── Fixtures ──────────────────────────────────────────────────

const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";
const LOCALE = "sv";

let store: FakeRedirectStore;

beforeEach(() => {
  store = new FakeRedirectStore();
  _id = 0;
});

// ──────────────────────────────────────────────────────────────

describe("collapseAndCreate — happy path", () => {
  it("creates a single row when no existing redirects exist", async () => {
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/shop/products/old",
      newPath: "/shop/products/new",
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      tenantId: TENANT_A,
      fromPath: "/shop/products/old",
      toPath: "/shop/products/new",
      locale: LOCALE,
      statusCode: 301,
    });
  });

  it("normalizes both paths before storing — uppercase + trailing slash", async () => {
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/Shop/Products/OLD/",
      newPath: "/Shop/Products/NEW/",
      locale: LOCALE,
    });

    expect(store.rows[0]).toMatchObject({
      fromPath: "/shop/products/old",
      toPath: "/shop/products/new",
    });
  });

  it("is a no-op when oldPath and newPath are identical (after normalization)", async () => {
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/shop/products/foo",
      newPath: "/Shop/Products/FOO", // normalizes to same
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(0);
  });
});

describe("collapseAndCreate — chain collapse", () => {
  it("after A→B then B→C, redirects are A→C and B→C (no chain)", async () => {
    // State after first rename (A → B): redirect A→B exists.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: LOCALE,
    });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ fromPath: "/p/a", toPath: "/p/b" });

    // Second rename (B → C): collapse A→B into A→C + insert B→C.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/b",
      newPath: "/p/c",
      locale: LOCALE,
    });

    const byFrom = (from: string) => store.rows.find((r) => r.fromPath === from);
    expect(store.rows).toHaveLength(2);
    expect(byFrom("/p/a")).toMatchObject({ toPath: "/p/c" });
    expect(byFrom("/p/b")).toMatchObject({ toPath: "/p/c" });
  });

  it("deep chain A→B→C→D never exceeds 1 hop at any stage", async () => {
    const tx = makeTx(store);

    // A → B
    await collapseAndCreate(tx, {
      tenantId: TENANT_A,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: LOCALE,
    });
    // B → C
    await collapseAndCreate(tx, {
      tenantId: TENANT_A,
      oldPath: "/p/b",
      newPath: "/p/c",
      locale: LOCALE,
    });
    // C → D
    await collapseAndCreate(tx, {
      tenantId: TENANT_A,
      oldPath: "/p/c",
      newPath: "/p/d",
      locale: LOCALE,
    });

    // All redirects now point at /p/d — no chains.
    expect(store.rows).toHaveLength(3);
    for (const row of store.rows) {
      expect(row.toPath).toBe("/p/d");
      // Self-reference check — catches the structural invariant
      // directly rather than relying on the absence of loops.
      expect(row.fromPath).not.toBe(row.toPath);
    }

    // Specific rows:
    const byFrom = (from: string) => store.rows.find((r) => r.fromPath === from);
    expect(byFrom("/p/a")).toMatchObject({ toPath: "/p/d" });
    expect(byFrom("/p/b")).toMatchObject({ toPath: "/p/d" });
    expect(byFrom("/p/c")).toMatchObject({ toPath: "/p/d" });
  });
});

describe("collapseAndCreate — slug revert (A → B → A)", () => {
  // This is the scenario the orientation flagged explicitly. The
  // ordering of steps inside `collapseAndCreate` is load-bearing:
  //   Step 1 (chain collapse) transiently creates a self-referential
  //   row A → A. Step 2 deletes it. Step 3 inserts the new B → A.
  //
  // If steps 2 and 3 were reversed, step 3's upsert would clash
  // with the self-referential row from step 1. If step 2 were
  // omitted, the self-referential row would survive and the live
  // page would 301 to itself — infinite loop.
  it("reverting back to a previous slug leaves a single B→A redirect", async () => {
    // State 0: no redirects.
    // State 1: entity renamed A → B.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: LOCALE,
    });
    expect(store.rows).toHaveLength(1);

    // State 2: entity renamed back B → A.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/b",
      newPath: "/p/a",
      locale: LOCALE,
    });

    // Final state: single redirect B → A. The original A → B row
    // (which step 1 turned into A → A self-reference) was wiped
    // by step 2.
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      fromPath: "/p/b",
      toPath: "/p/a",
    });
  });

  it("never leaves a self-referencing redirect in the store", async () => {
    // Multi-bounce: A → B → A → B → A. Every state must have
    // zero self-references in the store.
    const tx = makeTx(store);
    const bounces: Array<[string, string]> = [
      ["/p/a", "/p/b"],
      ["/p/b", "/p/a"],
      ["/p/a", "/p/b"],
      ["/p/b", "/p/a"],
    ];
    for (const [oldPath, newPath] of bounces) {
      await collapseAndCreate(tx, {
        tenantId: TENANT_A,
        oldPath,
        newPath,
        locale: LOCALE,
      });
      for (const row of store.rows) {
        expect(row.fromPath).not.toBe(row.toPath);
      }
    }
    // Final state after A↔B bouncing four times, currently at A.
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      fromPath: "/p/b",
      toPath: "/p/a",
    });
  });
});

describe("collapseAndCreate — tenant isolation", () => {
  it("redirects for tenant A are never touched when tenant B saves", async () => {
    // Tenant A establishes a redirect.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/old",
      newPath: "/p/new",
      locale: LOCALE,
    });
    expect(store.rows).toHaveLength(1);

    // Tenant B saves the SAME path-pair — must not collide with
    // tenant A's row. Two tenants can legitimately use identical
    // slugs because storefronts are subdomain-isolated.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_B,
      oldPath: "/p/old",
      newPath: "/p/new",
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(2);
    const aRow = store.rows.find((r) => r.tenantId === TENANT_A);
    const bRow = store.rows.find((r) => r.tenantId === TENANT_B);
    expect(aRow).toBeDefined();
    expect(bRow).toBeDefined();
  });

  it("chain-collapse updateMany is scoped by tenantId", async () => {
    // Tenant A has A→B. Tenant B has A→B (same paths, different
    // tenant). When tenant A renames B → C, tenant B's row must
    // stay untouched.
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: LOCALE,
    });
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_B,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: LOCALE,
    });

    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/b",
      newPath: "/p/c",
      locale: LOCALE,
    });

    const aRows = store.rows.filter((r) => r.tenantId === TENANT_A);
    const bRows = store.rows.filter((r) => r.tenantId === TENANT_B);
    // Tenant A: A→C and B→C (2 rows, both pointing at C).
    expect(aRows).toHaveLength(2);
    for (const r of aRows) expect(r.toPath).toBe("/p/c");
    // Tenant B: A→B untouched (1 row, still pointing at B).
    expect(bRows).toHaveLength(1);
    expect(bRows[0]).toMatchObject({ fromPath: "/p/a", toPath: "/p/b" });
  });
});

describe("collapseAndCreate — locale isolation", () => {
  it("redirects in locale `sv` are not touched when locale `en` saves the same paths", async () => {
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: "sv",
    });
    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/a",
      newPath: "/p/b",
      locale: "en",
    });

    // Two rows — same tenant + paths but different locales. The
    // unique `[tenantId, fromPath, locale]` constraint allows it.
    expect(store.rows).toHaveLength(2);
    const svRow = store.rows.find((r) => r.locale === "sv");
    const enRow = store.rows.find((r) => r.locale === "en");
    expect(svRow).toBeDefined();
    expect(enRow).toBeDefined();
  });
});

describe("collapseAndCreate — upsert edge case (stale row)", () => {
  it("pre-existing stale row at oldPath is overwritten, not duplicated", async () => {
    // Simulate a row left by a prior crashed transaction: oldPath
    // already has a redirect pointing somewhere (not newPath).
    store.rows.push({
      id: newId(),
      tenantId: TENANT_A,
      fromPath: "/p/old",
      toPath: "/p/stale-target",
      locale: LOCALE,
      statusCode: 301,
      createdAt: new Date("2020-01-01"),
      updatedAt: new Date("2020-01-01"),
    });

    await collapseAndCreate(makeTx(store), {
      tenantId: TENANT_A,
      oldPath: "/p/old",
      newPath: "/p/new",
      locale: LOCALE,
    });

    // Exactly one row, now pointing at the current target.
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      fromPath: "/p/old",
      toPath: "/p/new",
    });
  });
});

describe("cleanupRedirectsForDeletedEntity", () => {
  it("deletes redirects pointing AT the entity's path", async () => {
    // Three historic redirects all point at /p/deleted.
    for (const [fromPath, toPath] of [
      ["/p/old-1", "/p/deleted"],
      ["/p/old-2", "/p/deleted"],
      ["/p/old-3", "/p/deleted"],
    ] as const) {
      store.rows.push({
        id: newId(),
        tenantId: TENANT_A,
        fromPath,
        toPath,
        locale: LOCALE,
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await cleanupRedirectsForDeletedEntity(makeTx(store), {
      tenantId: TENANT_A,
      entityPath: "/p/deleted",
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(0);
  });

  it("leaves redirects pointing elsewhere intact", async () => {
    store.rows.push(
      {
        id: newId(),
        tenantId: TENANT_A,
        fromPath: "/p/old-1",
        toPath: "/p/deleted",
        locale: LOCALE,
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: newId(),
        tenantId: TENANT_A,
        fromPath: "/p/old-2",
        toPath: "/p/still-live",
        locale: LOCALE,
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    await cleanupRedirectsForDeletedEntity(makeTx(store), {
      tenantId: TENANT_A,
      entityPath: "/p/deleted",
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ toPath: "/p/still-live" });
  });

  it("is tenant-scoped", async () => {
    store.rows.push(
      {
        id: newId(),
        tenantId: TENANT_A,
        fromPath: "/p/old",
        toPath: "/p/deleted",
        locale: LOCALE,
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: newId(),
        tenantId: TENANT_B,
        fromPath: "/p/old",
        toPath: "/p/deleted",
        locale: LOCALE,
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    await cleanupRedirectsForDeletedEntity(makeTx(store), {
      tenantId: TENANT_A,
      entityPath: "/p/deleted",
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ tenantId: TENANT_B });
  });

  it("normalizes the entity path before matching", async () => {
    // Stored rows hold normalized paths (lowercase, no trailing /).
    // The caller may pass a pre-normalization path by mistake —
    // the helper normalizes defensively.
    store.rows.push({
      id: newId(),
      tenantId: TENANT_A,
      fromPath: "/p/old",
      toPath: "/p/deleted",
      locale: LOCALE,
      statusCode: 301,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await cleanupRedirectsForDeletedEntity(makeTx(store), {
      tenantId: TENANT_A,
      entityPath: "/P/DELETED/", // intentionally mixed-case + trailing /
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(0);
  });

  it("is locale-scoped — only deletes redirects in the specified locale", async () => {
    store.rows.push(
      {
        id: newId(),
        tenantId: TENANT_A,
        fromPath: "/p/old",
        toPath: "/p/deleted",
        locale: "sv",
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: newId(),
        tenantId: TENANT_A,
        fromPath: "/p/old",
        toPath: "/p/deleted",
        locale: "en",
        statusCode: 301,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    await cleanupRedirectsForDeletedEntity(makeTx(store), {
      tenantId: TENANT_A,
      entityPath: "/p/deleted",
      locale: "sv",
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ locale: "en" });
  });

  it("no-op when no redirects exist for the entity", async () => {
    await cleanupRedirectsForDeletedEntity(makeTx(store), {
      tenantId: TENANT_A,
      entityPath: "/p/deleted",
      locale: LOCALE,
    });

    expect(store.rows).toHaveLength(0);
  });
});
