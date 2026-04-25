import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: { findFirst: vi.fn() },
  },
}));

vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: vi.fn(),
}));

import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { checkAvailability } from "./check-availability";
import { DRAFT_ERRORS } from "./errors";

const findFirstMock = prisma.accommodation.findFirst as unknown as ReturnType<typeof vi.fn>;
const resolveAdapterMock = resolveAdapter as unknown as ReturnType<typeof vi.fn>;

const TENANT = "tenant_t";
const ACC = "acc_1";
const EXTERNAL = "ext_acc_1";
const FROM = new Date("2026-05-01");
const TO = new Date("2026-05-04");

function makeAdapter(
  unitMap: Map<string, boolean> | (() => Map<string, boolean>) | "throw",
) {
  return {
    provider: "fake",
    getUnitAvailability: vi.fn(async () => {
      if (unitMap === "throw") throw new Error("PMS down");
      return typeof unitMap === "function" ? unitMap() : unitMap;
    }),
  };
}

beforeEach(() => {
  findFirstMock.mockReset();
  resolveAdapterMock.mockReset();
  findFirstMock.mockResolvedValue({
    externalId: EXTERNAL,
    status: "ACTIVE",
    archivedAt: null,
  });
});

describe("checkAvailability — happy paths", () => {
  it("T1 — accommodation found + adapter returns available → ok", async () => {
    resolveAdapterMock.mockResolvedValue(makeAdapter(new Map([[EXTERNAL, true]])));
    expect(await checkAvailability(TENANT, ACC, FROM, TO)).toEqual({ available: true });
  });

  it("T2 — adapter returns unavailable → reason set", async () => {
    resolveAdapterMock.mockResolvedValue(makeAdapter(new Map([[EXTERNAL, false]])));
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result.available).toBe(false);
    expect(result.reason).toContain("Inte tillgängligt");
  });
});

describe("checkAvailability — accommodation gates", () => {
  it("T3 — cross-tenant accommodation → TENANT_MISMATCH", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    expect(await checkAvailability(TENANT, ACC, FROM, TO)).toEqual({
      available: false,
      reason: DRAFT_ERRORS.TENANT_MISMATCH,
    });
  });

  it("T4 — accommodation INACTIVE → not active reason", async () => {
    findFirstMock.mockResolvedValueOnce({
      externalId: EXTERNAL,
      status: "INACTIVE",
      archivedAt: null,
    });
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("Boendet är inte aktivt");
  });

  it("T5 — accommodation archived → not active reason", async () => {
    findFirstMock.mockResolvedValueOnce({
      externalId: EXTERNAL,
      status: "ACTIVE",
      archivedAt: new Date("2026-01-01"),
    });
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("Boendet är inte aktivt");
  });

  it("T6 — no externalId → available fallback (skip PMS)", async () => {
    findFirstMock.mockResolvedValueOnce({
      externalId: null,
      status: "ACTIVE",
      archivedAt: null,
    });
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result).toEqual({ available: true });
    expect(resolveAdapterMock).not.toHaveBeenCalled();
  });
});

describe("checkAvailability — adapter degradation", () => {
  it("T7 — resolveAdapter throws → PMS unreachable", async () => {
    resolveAdapterMock.mockRejectedValue(new Error("Cannot resolve"));
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("PMS unreachable");
  });

  it("T8 — getUnitAvailability throws → PMS unreachable", async () => {
    resolveAdapterMock.mockResolvedValue(makeAdapter("throw"));
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("PMS unreachable");
  });
});

describe("checkAvailability — input validation", () => {
  it("T9 — toDate <= fromDate → INVALID_DATE_RANGE, no DB call", async () => {
    const result = await checkAvailability(
      TENANT,
      ACC,
      new Date("2026-05-04"),
      new Date("2026-05-01"),
    );
    expect(result.available).toBe(false);
    expect(result.reason).toBe(DRAFT_ERRORS.INVALID_DATE_RANGE);
    expect(findFirstMock).not.toHaveBeenCalled();
  });
});

describe("checkAvailability — adapter behavior trust (Q5)", () => {
  it("T10 — adapter returns map without our externalId key → unavailable (default false)", async () => {
    // Simulates Fake-adapter returning empty/partial map for blocked dates.
    resolveAdapterMock.mockResolvedValue(makeAdapter(new Map()));
    const result = await checkAvailability(TENANT, ACC, FROM, TO);
    expect(result.available).toBe(false);
    expect(result.reason).toContain("Inte tillgängligt");
  });
});
