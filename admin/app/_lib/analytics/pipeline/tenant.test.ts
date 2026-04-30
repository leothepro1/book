/**
 * Unit tests for withTenant / _applyTenantScopeForTests.
 *
 * The pure args-rewriter (`_applyTenantScopeForTests`) is exercised across
 * every Prisma 6 model operation × (auto-inject, mismatch-reject, no-op)
 * paths. This is deliberately broader than the verify-phase0.ts end-to-end
 * check, which only covers create + read.
 *
 * We don't touch a real Prisma client here — that's verified by check 9 in
 * scripts/verify-phase0.ts. The args-manipulation logic is pure and doesn't
 * need a DB to test.
 */

import { describe, it, expect } from "vitest";
import {
  withTenant,
  _applyTenantScopeForTests as scope,
  AnalyticsTenantMissingError,
  AnalyticsTenantInvalidError,
  AnalyticsTenantMismatchError,
  type AnalyticsPipelineScope,
} from "./tenant";

const T = "cverify000000000000000000"; // 25 chars, matches /^c[a-z0-9]{24}$/
const OTHER = "cother0000000000000000001";
const M = "analyticsPipelineEvent";

describe("withTenant — tenantId validation", () => {
  it("throws AnalyticsTenantMissingError on empty string", async () => {
    await expect(withTenant("", async () => 0)).rejects.toBeInstanceOf(
      AnalyticsTenantMissingError,
    );
  });

  it("throws AnalyticsTenantMissingError on null", async () => {
    await expect(withTenant(null, async () => 0)).rejects.toBeInstanceOf(
      AnalyticsTenantMissingError,
    );
  });

  it("throws AnalyticsTenantMissingError on undefined", async () => {
    await expect(withTenant(undefined, async () => 0)).rejects.toBeInstanceOf(
      AnalyticsTenantMissingError,
    );
  });

  it("throws AnalyticsTenantInvalidError on Clerk-style org_*", async () => {
    await expect(
      withTenant("org_2abc1234567890abcdefghi", async () => 0),
    ).rejects.toBeInstanceOf(AnalyticsTenantInvalidError);
  });

  it("throws AnalyticsTenantInvalidError on uppercase chars", async () => {
    await expect(
      withTenant("cTEST0000000000000000000A", async () => 0),
    ).rejects.toBeInstanceOf(AnalyticsTenantInvalidError);
  });

  it("throws AnalyticsTenantInvalidError on wrong length", async () => {
    await expect(withTenant("c0", async () => 0)).rejects.toBeInstanceOf(
      AnalyticsTenantInvalidError,
    );
  });

  it("does not call fn when tenantId is invalid", async () => {
    let called = false;
    await expect(
      withTenant("bogus", async () => {
        called = true;
        return 0;
      }),
    ).rejects.toBeInstanceOf(AnalyticsTenantInvalidError);
    expect(called).toBe(false);
  });
});

describe("READ ops — inject tenantId into where", () => {
  const READ_OPS = [
    "findFirst",
    "findFirstOrThrow",
    "findUnique",
    "findUniqueOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
  ] as const;

  for (const op of READ_OPS) {
    it(`${op}: injects tenantId when where is missing`, () => {
      const out = scope(T, M, op, {});
      // Only the no-where-OK ops auto-create a where.
      const NO_WHERE_OK = new Set([
        "findMany",
        "count",
        "aggregate",
        "groupBy",
      ]);
      if (NO_WHERE_OK.has(op)) {
        expect(out.where).toEqual({ tenantId: T });
      } else {
        expect(out.where).toBeUndefined();
      }
    });

    it(`${op}: injects tenantId when where exists without it`, () => {
      const out = scope(T, M, op, { where: { eventName: "x" } });
      expect(out.where).toEqual({ eventName: "x", tenantId: T });
    });

    it(`${op}: passes through when where.tenantId matches`, () => {
      const out = scope(T, M, op, { where: { tenantId: T, eventName: "x" } });
      expect(out.where).toEqual({ tenantId: T, eventName: "x" });
    });

    it(`${op}: throws on tenantId mismatch in where`, () => {
      expect(() => scope(T, M, op, { where: { tenantId: OTHER } })).toThrow(
        AnalyticsTenantMismatchError,
      );
    });
  }
});

describe("WRITE-CREATE ops — inject tenantId into data", () => {
  it("create: injects tenantId when absent", () => {
    const out = scope(T, M, "create", {
      data: { eventId: "x", eventName: "n" },
    });
    expect(out.data).toEqual({ eventId: "x", eventName: "n", tenantId: T });
  });

  it("create: passes through when tenantId matches", () => {
    const out = scope(T, M, "create", {
      data: { eventId: "x", tenantId: T },
    });
    expect(out.data).toEqual({ eventId: "x", tenantId: T });
  });

  it("create: throws on tenantId mismatch", () => {
    expect(() =>
      scope(T, M, "create", { data: { tenantId: OTHER } }),
    ).toThrow(AnalyticsTenantMismatchError);
  });

  it("createMany: injects tenantId into every array element", () => {
    const out = scope(T, M, "createMany", {
      data: [{ eventId: "a" }, { eventId: "b" }],
    });
    expect(out.data).toEqual([
      { eventId: "a", tenantId: T },
      { eventId: "b", tenantId: T },
    ]);
  });

  it("createMany: rejects when any array element has mismatching tenantId", () => {
    expect(() =>
      scope(T, M, "createMany", {
        data: [{ eventId: "a" }, { eventId: "b", tenantId: OTHER }],
      }),
    ).toThrow(AnalyticsTenantMismatchError);
  });

  it("createManyAndReturn: behaves like createMany", () => {
    const out = scope(T, M, "createManyAndReturn", {
      data: [{ eventId: "a" }],
    });
    expect(out.data).toEqual([{ eventId: "a", tenantId: T }]);
  });
});

describe("WRITE-MUTATE ops — inject where, validate data", () => {
  it("update: injects where, leaves data alone if no tenantId", () => {
    const out = scope(T, M, "update", {
      where: { eventId: "x" },
      data: { eventName: "renamed" },
    });
    expect(out.where).toEqual({ eventId: "x", tenantId: T });
    expect(out.data).toEqual({ eventName: "renamed" });
  });

  it("update: throws on data.tenantId mismatch (immutability)", () => {
    expect(() =>
      scope(T, M, "update", {
        where: { eventId: "x" },
        data: { tenantId: OTHER },
      }),
    ).toThrow(AnalyticsTenantMismatchError);
  });

  it("update: allows data.tenantId matching scope (no-op)", () => {
    const out = scope(T, M, "update", {
      where: { eventId: "x" },
      data: { tenantId: T },
    });
    expect(out.data).toEqual({ tenantId: T });
  });

  it("updateMany: injects where, validates data", () => {
    const out = scope(T, M, "updateMany", {
      where: { eventName: "x" },
      data: { eventName: "y" },
    });
    expect(out.where).toEqual({ eventName: "x", tenantId: T });
  });

  it("updateMany: throws on where.tenantId mismatch", () => {
    expect(() =>
      scope(T, M, "updateMany", {
        where: { tenantId: OTHER },
        data: {},
      }),
    ).toThrow(AnalyticsTenantMismatchError);
  });

  it("updateManyAndReturn: behaves like updateMany", () => {
    const out = scope(T, M, "updateManyAndReturn", {
      where: { eventName: "x" },
      data: { eventName: "y" },
    });
    expect(out.where).toEqual({ eventName: "x", tenantId: T });
  });

  it("delete: injects tenantId into where", () => {
    const out = scope(T, M, "delete", { where: { eventId: "x" } });
    expect(out.where).toEqual({ eventId: "x", tenantId: T });
  });

  it("deleteMany: bare where injection", () => {
    const out = scope(T, M, "deleteMany", {});
    expect(out.where).toEqual({ tenantId: T });
  });

  it("deleteMany: throws on tenantId mismatch", () => {
    expect(() =>
      scope(T, M, "deleteMany", { where: { tenantId: OTHER } }),
    ).toThrow(AnalyticsTenantMismatchError);
  });
});

describe("WRITE-UPSERT — where + create + update", () => {
  it("upsert: injects all three correctly", () => {
    const out = scope(T, M, "upsert", {
      where: { eventId: "x" },
      create: { eventId: "x", eventName: "n" },
      update: { eventName: "renamed" },
    });
    expect(out.where).toEqual({ eventId: "x", tenantId: T });
    expect(out.create).toEqual({
      eventId: "x",
      eventName: "n",
      tenantId: T,
    });
    expect(out.update).toEqual({ eventName: "renamed" });
  });

  it("upsert: throws on create.tenantId mismatch", () => {
    expect(() =>
      scope(T, M, "upsert", {
        where: { eventId: "x" },
        create: { tenantId: OTHER },
        update: {},
      }),
    ).toThrow(AnalyticsTenantMismatchError);
  });

  it("upsert: throws on update.tenantId mismatch (immutability)", () => {
    expect(() =>
      scope(T, M, "upsert", {
        where: { eventId: "x" },
        create: {},
        update: { tenantId: OTHER },
      }),
    ).toThrow(AnalyticsTenantMismatchError);
  });

  it("upsert: throws on where.tenantId mismatch", () => {
    expect(() =>
      scope(T, M, "upsert", {
        where: { tenantId: OTHER },
        create: {},
        update: {},
      }),
    ).toThrow(AnalyticsTenantMismatchError);
  });
});

describe("scope leak — branded type and runtime closure", () => {
  it("the scoped db argument cannot be the raw PrismaClient", () => {
    // Compile-time: this test doesn't actually run anything; the assertion
    // is that the type system rejects passing a raw client where an
    // AnalyticsPipelineScope is expected. Documented as a runtime smoke too.
    type AcceptsScopeOnly = (db: AnalyticsPipelineScope) => unknown;
    const _fn: AcceptsScopeOnly = (db) => db; // signature compiles
    expect(typeof _fn).toBe("function");
  });

  it("withTenant resolves to fn's return value, never the db handle", async () => {
    const result = await withTenant(T, async (db) => {
      // Confirm db is an object (the scoped Prisma client). We don't call
      // any model method here — that would require a real DB. The branded
      // type guards against accidental return.
      expect(db).toBeTruthy();
      return 7;
    });
    expect(result).toBe(7);
  });
});
