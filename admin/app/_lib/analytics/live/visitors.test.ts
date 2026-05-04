/**
 * getVisitorsNow — DB query tests.
 *
 * Mocks `_unguardedAnalyticsPipelineClient.$queryRaw` and verifies:
 *   1. SQL shape — tenant_id literal in WHERE, 5-min window via
 *      INTERVAL, COUNT(DISTINCT payload->>'session_id'), partition-
 *      prune-friendly bound on occurred_at.
 *   2. Distinct counting via the simulated DB returns the right number
 *      for a fixture event set: tenant A has 4 distinct session_ids in
 *      the window; tenant B has 1; events older than 5 min for tenant A
 *      are excluded.
 *   3. Cross-tenant isolation — a query for tenant A never returns
 *      tenant B's events.
 *   4. Empty-result handling — 0 returned when no events match.
 *
 * EXPLAIN ANALYZE plan from a live Neon dev DB run is captured in the
 * B.1 commit message, proving Index Scan on
 * event_tenant_id_occurred_at_idx (not Seq Scan).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "ctest1visitorsA00000000000";
const TENANT_B = "ctest1visitorsB00000000000";

interface MockEvent {
  tenant_id: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
}

const mockEvents: MockEvent[] = [];

vi.mock("@/app/_lib/db/prisma", () => {
  const mockClient = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");

        // The query simulator only handles the besökare-widget query
        // shape. Anything else throws, so a regression in the SQL
        // template would surface immediately.
        if (
          !sql.includes("COUNT(DISTINCT payload->>'session_id')") ||
          !sql.includes("FROM analytics.event") ||
          !sql.includes("tenant_id = ") ||
          !sql.includes("occurred_at > NOW() - INTERVAL '5 minutes'") ||
          !sql.includes("payload ? 'session_id'")
        ) {
          throw new Error(
            "unexpected SQL shape — getVisitorsNow regression: " +
              sql.slice(0, 200),
          );
        }

        const tenantId = values[0] as string;
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);

        const matching = mockEvents.filter(
          (e) =>
            e.tenant_id === tenantId &&
            e.occurred_at > cutoff &&
            typeof (e.payload as { session_id?: string }).session_id === "string",
        );

        const distinct = new Set(
          matching.map(
            (e) => (e.payload as { session_id: string }).session_id,
          ),
        );

        return [{ visitors_now: distinct.size }];
      },
    ),
  };
  return {
    _unguardedAnalyticsPipelineClient: mockClient,
    prisma: mockClient,
  };
});

const { getVisitorsNow } = await import("./visitors");

function pushEvent(
  tenantId: string,
  ageSeconds: number,
  sessionId: string | null,
): void {
  const occurredAt = new Date(Date.now() - ageSeconds * 1000);
  const payload: Record<string, unknown> = sessionId === null ? {} : { session_id: sessionId };
  mockEvents.push({ tenant_id: tenantId, occurred_at: occurredAt, payload });
}

describe("getVisitorsNow", () => {
  beforeEach(() => {
    mockEvents.length = 0;
  });

  it("returns 4 for tenant A with 4 distinct session_ids in 5-min window", async () => {
    // 10 events across 4 distinct session_ids in the window
    pushEvent(TENANT_A, 30, "01HZSESS1AAAAAAAAAAAAAAAAA");
    pushEvent(TENANT_A, 60, "01HZSESS1AAAAAAAAAAAAAAAAA"); // duplicate
    pushEvent(TENANT_A, 90, "01HZSESS1AAAAAAAAAAAAAAAAA"); // duplicate
    pushEvent(TENANT_A, 120, "01HZSESS2BBBBBBBBBBBBBBBBB");
    pushEvent(TENANT_A, 150, "01HZSESS2BBBBBBBBBBBBBBBBB"); // duplicate
    pushEvent(TENANT_A, 180, "01HZSESS3CCCCCCCCCCCCCCCCC");
    pushEvent(TENANT_A, 210, "01HZSESS3CCCCCCCCCCCCCCCCC"); // duplicate
    pushEvent(TENANT_A, 240, "01HZSESS3CCCCCCCCCCCCCCCCC"); // duplicate
    pushEvent(TENANT_A, 270, "01HZSESS4DDDDDDDDDDDDDDDDD");
    pushEvent(TENANT_A, 290, "01HZSESS4DDDDDDDDDDDDDDDDD"); // duplicate

    expect(await getVisitorsNow(TENANT_A)).toBe(4);
  });

  it("returns 1 for tenant B with 1 distinct session_id in 5-min window", async () => {
    pushEvent(TENANT_B, 60, "01HZSESS5EEEEEEEEEEEEEEEEE");
    pushEvent(TENANT_B, 120, "01HZSESS5EEEEEEEEEEEEEEEEE"); // duplicate

    expect(await getVisitorsNow(TENANT_B)).toBe(1);
  });

  it("excludes events older than 5 min from the count", async () => {
    pushEvent(TENANT_A, 30, "01HZSESS6FFFFFFFFFFFFFFFFFF"); // in window
    pushEvent(TENANT_A, 6 * 60, "01HZSESS7GGGGGGGGGGGGGGGGG"); // 6 min — outside
    pushEvent(TENANT_A, 10 * 60, "01HZSESS8HHHHHHHHHHHHHHHHH"); // 10 min — outside

    expect(await getVisitorsNow(TENANT_A)).toBe(1);
  });

  it("cross-tenant isolation — tenant A query does not see tenant B events", async () => {
    pushEvent(TENANT_A, 30, "01HZAONLY1AAAAAAAAAAAAAAAA");
    pushEvent(TENANT_B, 30, "01HZBONLY1BBBBBBBBBBBBBBBB");
    pushEvent(TENANT_B, 60, "01HZBONLY2CCCCCCCCCCCCCCCC");

    expect(await getVisitorsNow(TENANT_A)).toBe(1);
    expect(await getVisitorsNow(TENANT_B)).toBe(2);
  });

  it("returns 0 when tenant has no matching events", async () => {
    // Empty mock store
    expect(await getVisitorsNow(TENANT_A)).toBe(0);
  });

  it("returns 0 when all events for the tenant lack session_id", async () => {
    // Server-emitted events don't carry session_id — the
    // `payload ? 'session_id'` predicate filters them.
    pushEvent(TENANT_A, 30, null);
    pushEvent(TENANT_A, 60, null);

    expect(await getVisitorsNow(TENANT_A)).toBe(0);
  });

  it("counts overlapping sessions correctly across multiple tenants", async () => {
    // Same session_id string appearing for tenant A and tenant B —
    // distinct count is per-tenant, so each tenant should see 1.
    const sharedId = "01HZ_SHARED_SESSION_AAAAA1";
    pushEvent(TENANT_A, 30, sharedId);
    pushEvent(TENANT_B, 30, sharedId);

    expect(await getVisitorsNow(TENANT_A)).toBe(1);
    expect(await getVisitorsNow(TENANT_B)).toBe(1);
  });
});
