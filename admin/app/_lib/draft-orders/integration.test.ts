/**
 * FAS 7.0 — integration smoke tests for draft-orders read services.
 *
 * Gated on `DATABASE_URL_TEST`: this file requires a real Postgres test
 * database with the project's Prisma schema applied. When the env var is
 * absent (the common case in CI/local-without-test-DB), the entire suite
 * is skipped via `describe.skipIf` — vitest reports "skipped" cleanly,
 * never "failed". To run it locally:
 *
 *   DATABASE_URL_TEST=postgresql://… npx vitest run \
 *     app/_lib/draft-orders/integration.test.ts
 *
 * The point of this file is to catch schema drift that mock-based unit
 * tests miss — column renames, index changes, constraint additions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_DB = process.env.DATABASE_URL_TEST;
const RUN = Boolean(TEST_DB);

describe.skipIf(!RUN)("FAS 7.0 — integration smoke", () => {
  let prisma: PrismaClient;
  const tenantAlpha = `t_alpha_${Date.now()}`;
  const tenantBeta = `t_beta_${Date.now()}`;
  const seedDraftIds: string[] = [];

  beforeAll(async () => {
    if (!RUN) return;
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
    // Seed two tenants with overlapping draft data.
    const tenants = [tenantAlpha, tenantBeta];
    for (const id of tenants) {
      await prisma.tenant.create({
        data: {
          id,
          name: id,
          slug: id,
          settings: {},
          clerkOrgId: `clerk_${id}`,
          checkinEnabled: false,
          checkoutEnabled: false,
        },
      });
    }
    const draftSeeds = [
      { tenantId: tenantAlpha, n: "D-A-1" },
      { tenantId: tenantAlpha, n: "D-A-2" },
      { tenantId: tenantAlpha, n: "D-A-3" },
      { tenantId: tenantBeta, n: "D-B-1" },
      { tenantId: tenantBeta, n: "D-B-2" },
    ];
    for (const seed of draftSeeds) {
      const d = await prisma.draftOrder.create({
        data: {
          tenantId: seed.tenantId,
          displayNumber: seed.n,
          buyerKind: "GUEST",
          contactEmail: `${seed.n}@example.com`,
          contactFirstName: "Test",
          contactLastName: "Customer",
          status: "OPEN",
          currency: "SEK",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      seedDraftIds.push(d.id);
    }
  });

  afterAll(async () => {
    if (!RUN || !prisma) return;
    await prisma.draftOrder.deleteMany({
      where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAlpha, tenantBeta] } },
    });
    await prisma.$disconnect();
  });

  // ─ I1: real tenant isolation across listDrafts roundtrip ─
  it("I1 — listDrafts respects tenant isolation under real Prisma", async () => {
    const { listDrafts } = await import("./list");

    const alphaPage = await listDrafts(tenantAlpha);
    const betaPage = await listDrafts(tenantBeta);

    expect(alphaPage.totalCount).toBe(3);
    expect(betaPage.totalCount).toBe(2);

    const alphaIds = alphaPage.items.map((i) => i.id);
    const betaIds = betaPage.items.map((i) => i.id);
    // Cross-set check: no leakage in either direction.
    for (const id of alphaIds) expect(betaIds).not.toContain(id);
    for (const id of betaIds) expect(alphaIds).not.toContain(id);
  });

  // ─ I2: getDraft full-hydration roundtrip ─
  it("I2 — getDraft hydrates draft + events + customer over real Prisma", async () => {
    const { getDraft } = await import("./get");

    const targetId = seedDraftIds[0];
    const detail = await getDraft(targetId, tenantAlpha);

    expect(detail).not.toBeNull();
    expect(detail?.draft.id).toBe(targetId);
    expect(detail?.draft.tenantId).toBe(tenantAlpha);
    expect(Array.isArray(detail?.events)).toBe(true);
    expect(Array.isArray(detail?.reservations)).toBe(true);

    // Cross-tenant access on the same id from the wrong tenant returns null.
    const crossTenant = await getDraft(targetId, tenantBeta);
    expect(crossTenant).toBeNull();
  });
});
