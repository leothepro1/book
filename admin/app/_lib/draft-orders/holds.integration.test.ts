/**
 * Phase E.1 — `placeHoldsForDraft` real-call-graph integration test.
 *
 * Gated on `DATABASE_URL_TEST` (mirrors `integration.test.ts` and
 * `integration-7.2a.test.ts` — same convention). When the env var is
 * absent, `describe.skipIf` makes the whole file no-op cleanly. To run
 * it locally:
 *
 *   DATABASE_URL_TEST=postgresql://… npx vitest run \
 *     app/_lib/draft-orders/holds.integration.test.ts
 *
 * Why this file exists: Phase E's `checkout-session.test.ts` mocks
 * `./holds` at module level, so the original `assertDraftMutable` →
 * `placeHoldsForDraft` → INVOICED-draft contradiction was invisible in
 * unit tests. This file exercises the real call graph, mocking ONLY
 * the PMS adapter at its registry boundary. Any future drift where the
 * helper's internal guard rejects a status that v1.3 §6.5 / §7.3
 * permit would surface here.
 *
 * Test scope decision (deviation from plan §"holds.integration.test.ts"):
 * The plan's case 6 describes an end-to-end via
 * `createDraftCheckoutSession`. The bug class lives entirely inside
 * `placeHoldsForDraft`'s first lines (load + guard); going through the
 * full Phase E pipeline adds Stripe + Connect + tenant-readiness
 * mocking ceremony without exercising any additional code path that
 * could harbour the same bug. Case 6 here calls `placeHoldsForDraft`
 * directly on a real INVOICED draft with real `DraftReservation` rows
 * — same regression coverage, less infra surface.
 *
 * NOTE on CI: this file's tests are skipped when `DATABASE_URL_TEST`
 * is unset (the typical CI environment). The PRIMARY regression-
 * prevention safety net for the assertDraftCanPlaceHolds bug class is
 * the unit-test matrix in `holds.test.ts`, which runs unconditionally.
 * This file is the local-dev belt-and-suspenders catching real-Postgres
 * schema drift on top.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_DB = process.env.DATABASE_URL_TEST;
const RUN = Boolean(TEST_DB);

// ── Mock the PMS adapter boundary ──────────────────────────────
//
// `resolveAdapter` is the single entry point holds.ts uses to reach
// the PMS. Mocking here keeps every other module — holds.ts itself,
// events.ts, the calculator, idempotency, the prisma client — REAL.
const mockHoldAvailability = vi.fn();
const mockReleaseHold = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: async () => ({
    provider: "fake",
    holdAvailability: (...args: unknown[]) => mockHoldAvailability(...args),
    releaseHold: (...args: unknown[]) => mockReleaseHold(...args),
  }),
}));

// Idempotency wrapper bypassed — withIdempotency runs the inner fn
// directly so we don't need a real PmsIdempotencyKey row.
vi.mock("@/app/_lib/integrations/reliability/idempotency", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/_lib/integrations/reliability/idempotency")
  >("@/app/_lib/integrations/reliability/idempotency");
  return {
    ...actual,
    withIdempotency: async (
      _key: string,
      _opts: unknown,
      fn: () => Promise<unknown>,
    ) => fn(),
  };
});

// emitPlatformEvent + log: silenced (no observable behaviour under test).
vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

describe.skipIf(!RUN)(
  "Phase E.1 — placeHoldsForDraft real-call-graph integration",
  () => {
    let prisma: PrismaClient;
    const tenantId = `t_e1_${Date.now()}`;
    let accommodationId: string;
    let placeholderAccId: string;

    beforeAll(async () => {
      if (!RUN) return;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: tenantId,
          slug: tenantId,
          settings: {},
          clerkOrgId: `clerk_${tenantId}`,
          checkinEnabled: false,
          checkoutEnabled: false,
        },
      });

      // PMS-synced accommodation (externalId set → eligible for holds).
      const acc = await prisma.accommodation.create({
        data: {
          tenantId,
          name: "Suite Alpha",
          slug: "suite-alpha",
          accommodationType: "HOTEL",
          status: "ACTIVE",
          externalId: "ext_alpha",
          maxGuests: 2,
        },
      });
      accommodationId = acc.id;

      // Placeholder accommodation used by drafts that don't need
      // PMS placement (status reject tests). externalId=null so the
      // pre-filter would skip it even if a hold were attempted.
      const placeholder = await prisma.accommodation.create({
        data: {
          tenantId,
          name: "Placeholder",
          slug: "placeholder",
          accommodationType: "HOTEL",
          status: "ACTIVE",
          externalId: null,
          maxGuests: 1,
        },
      });
      placeholderAccId = placeholder.id;
    });

    afterAll(async () => {
      if (!RUN || !prisma) return;
      await prisma.draftReservation.deleteMany({ where: { tenantId } });
      await prisma.draftLineItem.deleteMany({ where: { tenantId } });
      await prisma.draftOrderEvent.deleteMany({ where: { tenantId } });
      await prisma.draftOrder.deleteMany({ where: { tenantId } });
      await prisma.accommodation.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
      await prisma.$disconnect();
    });

    beforeEach(() => {
      mockHoldAvailability.mockReset();
      mockReleaseHold.mockReset();
    });

    /** Seed a single-line draft with a NOT_PLACED reservation against
     *  the PMS-synced accommodation. Returns the draft id. */
    async function seedDraft(
      status: "OPEN" | "INVOICED" | "OVERDUE" | "PAID" | "CANCELLED" | "COMPLETED",
      opts: {
        cancelledAt?: Date | null;
        completedAt?: Date | null;
        accId?: string;
      } = {},
    ): Promise<string> {
      const accId = opts.accId ?? accommodationId;
      const draft = await prisma.draftOrder.create({
        data: {
          tenantId,
          displayNumber: `D-E1-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          buyerKind: "GUEST",
          contactEmail: "buyer@example.com",
          contactFirstName: "Buyer",
          contactLastName: "Test",
          status,
          currency: "SEK",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          cancelledAt: opts.cancelledAt ?? null,
          completedAt: opts.completedAt ?? null,
        },
      });
      const line = await prisma.draftLineItem.create({
        data: {
          tenantId,
          draftOrderId: draft.id,
          lineType: "ACCOMMODATION",
          position: 0,
          accommodationId: accId,
          title: "Suite Alpha",
          quantity: 1,
          unitPriceCents: BigInt(10_000),
          subtotalCents: BigInt(10_000),
          totalCents: BigInt(10_000),
        },
      });
      await prisma.draftReservation.create({
        data: {
          tenantId,
          draftOrderId: draft.id,
          draftLineItemId: line.id,
          accommodationId: accId,
          ratePlanId: "rp_test",
          checkInDate: new Date("2026-06-01"),
          checkOutDate: new Date("2026-06-04"),
          guestCounts: { adults: 1 },
          holdState: "NOT_PLACED",
        },
      });
      return draft.id;
    }

    // ─ Case 1 (REGRESSION): INVOICED draft accepts hold placement ─
    it("Case 1 — INVOICED draft: placeHoldsForDraft succeeds (regression: pre-E.1 would have thrown ValidationError)", async () => {
      const { placeHoldsForDraft } = await import("./holds");
      const draftId = await seedDraft("INVOICED");
      mockHoldAvailability.mockResolvedValue({
        externalId: "ext_hold_invoiced",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const result = await placeHoldsForDraft({
        tenantId,
        draftOrderId: draftId,
      });

      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.placed).toHaveLength(1);
      expect(result.placed[0].holdExternalId).toBe("ext_hold_invoiced");
      expect(mockHoldAvailability).toHaveBeenCalledTimes(1);
    });

    // ─ Case 2: OPEN draft (existing behaviour preserved) ─
    it("Case 2 — OPEN draft: placeHoldsForDraft succeeds (existing behaviour)", async () => {
      const { placeHoldsForDraft } = await import("./holds");
      const draftId = await seedDraft("OPEN");
      mockHoldAvailability.mockResolvedValue({
        externalId: "ext_hold_open",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const result = await placeHoldsForDraft({
        tenantId,
        draftOrderId: draftId,
      });

      expect(result.placed).toHaveLength(1);
      expect(result.placed[0].holdExternalId).toBe("ext_hold_open");
    });

    // ─ Case 3: PAID draft → ValidationError ─
    it("Case 3 — PAID draft: placeHoldsForDraft throws ValidationError", async () => {
      const { placeHoldsForDraft } = await import("./holds");
      const draftId = await seedDraft("PAID", { accId: placeholderAccId });

      await expect(
        placeHoldsForDraft({ tenantId, draftOrderId: draftId }),
      ).rejects.toThrow(/Draft cannot place holds/);
      expect(mockHoldAvailability).not.toHaveBeenCalled();
    });

    // ─ Case 4: CANCELLED draft → ValidationError ─
    it("Case 4 — CANCELLED draft: placeHoldsForDraft throws ValidationError", async () => {
      const { placeHoldsForDraft } = await import("./holds");
      const draftId = await seedDraft("CANCELLED", {
        accId: placeholderAccId,
        cancelledAt: new Date(),
      });

      await expect(
        placeHoldsForDraft({ tenantId, draftOrderId: draftId }),
      ).rejects.toThrow(/Draft cannot place holds/);
      expect(mockHoldAvailability).not.toHaveBeenCalled();
    });

    // ─ Case 5: soft-deleted draft (status=OPEN, cancelledAt set) ─
    it("Case 5 — soft-deleted draft (OPEN + cancelledAt): placeHoldsForDraft throws ValidationError", async () => {
      const { placeHoldsForDraft } = await import("./holds");
      const draftId = await seedDraft("OPEN", {
        accId: placeholderAccId,
        cancelledAt: new Date(),
      });

      await expect(
        placeHoldsForDraft({ tenantId, draftOrderId: draftId }),
      ).rejects.toThrow(/Draft cannot place holds/);
      expect(mockHoldAvailability).not.toHaveBeenCalled();
    });

    // ─ Case 6 (THE BUG-CATCHER): INVOICED real-pipeline assertion ─
    it("Case 6 — INVOICED + real reservations: full placeHoldsForDraft pipeline succeeds end-to-end (the test that would have caught the original bug)", async () => {
      const { placeHoldsForDraft } = await import("./holds");
      const draftId = await seedDraft("INVOICED");
      mockHoldAvailability.mockResolvedValue({
        externalId: "ext_hold_e2e",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const result = await placeHoldsForDraft({
        tenantId,
        draftOrderId: draftId,
      });

      expect(result.placed).toHaveLength(1);

      // Real DB read: the reservation row was actually flipped to PLACED.
      const reservations = await prisma.draftReservation.findMany({
        where: { draftOrderId: draftId },
        select: { holdState: true, holdExternalId: true },
      });
      expect(reservations).toHaveLength(1);
      expect(reservations[0].holdState).toBe("PLACED");
      expect(reservations[0].holdExternalId).toBe("ext_hold_e2e");
    });
  },
);
