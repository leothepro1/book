import { describe, it, expect } from "vitest";
import {
  applyTier,
  hoursUntilCheckIn,
  calculateFee,
} from "./policy";
import {
  CancellationTiersSchema,
  CancellationPolicySnapshotSchema,
  type CancellationPolicySnapshot,
  type CancellationTiers,
} from "./types";

// Conventional hotel schedule used across most tests.
const STANDARD_TIERS: CancellationTiers = [
  { hoursBeforeCheckIn: 720, feePercent: 0 }, // 30 d
  { hoursBeforeCheckIn: 168, feePercent: 50 }, // 7 d
  { hoursBeforeCheckIn: 0, feePercent: 100 }, // same day
];

function snapshot(tiers: CancellationTiers = STANDARD_TIERS): CancellationPolicySnapshot {
  return {
    policyId: "cup_test",
    policyName: "Standard",
    tiers,
    requireApproval: false,
    autoExpireHours: 48,
    snapshottedAt: new Date("2026-04-22T00:00:00Z").toISOString(),
  };
}

describe("applyTier", () => {
  it("picks the tier matching current lead time (most-advance first)", () => {
    expect(applyTier(STANDARD_TIERS, 800).feePercent).toBe(0); // well outside 30 d
    expect(applyTier(STANDARD_TIERS, 720).feePercent).toBe(0); // exactly at 30 d
    expect(applyTier(STANDARD_TIERS, 500).feePercent).toBe(50); // between 7 d and 30 d
    expect(applyTier(STANDARD_TIERS, 168).feePercent).toBe(50); // exactly at 7 d
    expect(applyTier(STANDARD_TIERS, 100).feePercent).toBe(100); // inside 7 d
    expect(applyTier(STANDARD_TIERS, 0).feePercent).toBe(100); // at check-in
  });

  it("returns strictest tier when lead time is past all thresholds", () => {
    const tiers: CancellationTiers = [
      { hoursBeforeCheckIn: 24, feePercent: 25 },
      { hoursBeforeCheckIn: 48, feePercent: 10 },
    ];
    // Less than 24h lead: no tier's threshold satisfied → strictest applies.
    expect(applyTier(tiers, 10).feePercent).toBe(25);
  });

  it("handles negative lead time (check-in in the past) by returning strictest tier", () => {
    expect(applyTier(STANDARD_TIERS, -5).feePercent).toBe(100);
    expect(applyTier(STANDARD_TIERS, -1000).feePercent).toBe(100);
  });

  it("accepts unsorted input without mutating it", () => {
    const unsorted: CancellationTiers = [
      { hoursBeforeCheckIn: 168, feePercent: 50 },
      { hoursBeforeCheckIn: 720, feePercent: 0 },
      { hoursBeforeCheckIn: 0, feePercent: 100 },
    ];
    const before = JSON.stringify(unsorted);
    expect(applyTier(unsorted, 800).feePercent).toBe(0);
    expect(JSON.stringify(unsorted)).toBe(before);
  });

  it("single-tier policies always return that tier", () => {
    const flat: CancellationTiers = [{ hoursBeforeCheckIn: 0, feePercent: 100 }];
    expect(applyTier(flat, 1_000_000).feePercent).toBe(100);
    expect(applyTier(flat, 0).feePercent).toBe(100);
  });
});

describe("hoursUntilCheckIn", () => {
  const now = new Date("2026-04-22T12:00:00Z");

  it("returns positive hours when check-in is in the future", () => {
    expect(hoursUntilCheckIn(new Date("2026-04-22T18:00:00Z"), now)).toBe(6);
    expect(hoursUntilCheckIn(new Date("2026-04-23T12:00:00Z"), now)).toBe(24);
  });

  it("returns 0 at exact match", () => {
    expect(hoursUntilCheckIn(now, now)).toBe(0);
  });

  it("returns negative hours when check-in has passed", () => {
    expect(hoursUntilCheckIn(new Date("2026-04-22T06:00:00Z"), now)).toBe(-6);
  });

  it("partial hours round DOWN (Math.floor — guest is in the lower tier)", () => {
    // 3h 59m before check-in should count as 3h, putting guest in "less than 4h" bucket.
    expect(
      hoursUntilCheckIn(new Date(now.getTime() + 3 * 3_600_000 + 59 * 60_000), now),
    ).toBe(3);
  });
});

describe("calculateFee", () => {
  const now = new Date("2026-04-22T12:00:00Z");

  it("full refund when > 30 d away (0 %)", () => {
    const checkIn = new Date(now.getTime() + 800 * 3_600_000);
    const r = calculateFee({
      originalAmountOre: 50_000,
      snapshot: snapshot(),
      checkIn,
      now,
    });
    expect(r.feeAmountOre).toBe(0);
    expect(r.refundAmountOre).toBe(50_000);
    expect(r.appliedTier.feePercent).toBe(0);
  });

  it("50 % fee when 7–30 d away", () => {
    const checkIn = new Date(now.getTime() + 500 * 3_600_000);
    const r = calculateFee({
      originalAmountOre: 100_000,
      snapshot: snapshot(),
      checkIn,
      now,
    });
    expect(r.feeAmountOre).toBe(50_000);
    expect(r.refundAmountOre).toBe(50_000);
    expect(r.appliedTier.feePercent).toBe(50);
  });

  it("100 % fee within 7 d (no refund)", () => {
    const checkIn = new Date(now.getTime() + 48 * 3_600_000);
    const r = calculateFee({
      originalAmountOre: 99_999,
      snapshot: snapshot(),
      checkIn,
      now,
    });
    expect(r.feeAmountOre).toBe(99_999);
    expect(r.refundAmountOre).toBe(0);
    expect(r.appliedTier.feePercent).toBe(100);
  });

  it("fee rounds UP (merchant-favoring)", () => {
    // 50% of 12345 = 6172.5 → ceil = 6173, refund = 6172.
    const checkIn = new Date(now.getTime() + 500 * 3_600_000);
    const r = calculateFee({
      originalAmountOre: 12_345,
      snapshot: snapshot(),
      checkIn,
      now,
    });
    expect(r.feeAmountOre).toBe(6_173);
    expect(r.refundAmountOre).toBe(6_172);
  });

  it("zero-amount booking produces zero fee and zero refund", () => {
    const checkIn = new Date(now.getTime() + 48 * 3_600_000);
    const r = calculateFee({
      originalAmountOre: 0,
      snapshot: snapshot(),
      checkIn,
      now,
    });
    expect(r.feeAmountOre).toBe(0);
    expect(r.refundAmountOre).toBe(0);
  });

  it("past check-in (no-show) applies strictest tier", () => {
    const checkIn = new Date(now.getTime() - 24 * 3_600_000);
    const r = calculateFee({
      originalAmountOre: 10_000,
      snapshot: snapshot(),
      checkIn,
      now,
    });
    expect(r.feeAmountOre).toBe(10_000);
    expect(r.refundAmountOre).toBe(0);
    expect(r.hoursBeforeCheckInAtRequest).toBe(-24);
  });

  it("rejects non-integer original amount", () => {
    expect(() =>
      calculateFee({
        originalAmountOre: 100.5,
        snapshot: snapshot(),
        checkIn: new Date(now.getTime() + 1_000 * 3_600_000),
        now,
      }),
    ).toThrow(/integer/);
  });

  it("rejects negative original amount", () => {
    expect(() =>
      calculateFee({
        originalAmountOre: -1,
        snapshot: snapshot(),
        checkIn: new Date(now.getTime() + 1_000 * 3_600_000),
        now,
      }),
    ).toThrow(/non-negative/);
  });
});

// ─── Schema integration: make sure realistic policies round-trip ──────

describe("Zod schemas", () => {
  it("accepts a valid tiers array", () => {
    expect(() => CancellationTiersSchema.parse(STANDARD_TIERS)).not.toThrow();
  });

  it("rejects empty tiers array", () => {
    expect(() => CancellationTiersSchema.parse([])).toThrow();
  });

  it("rejects duplicate tier thresholds (misconfiguration)", () => {
    expect(() =>
      CancellationTiersSchema.parse([
        { hoursBeforeCheckIn: 168, feePercent: 50 },
        { hoursBeforeCheckIn: 168, feePercent: 75 },
      ]),
    ).toThrow(/duplicate/);
  });

  it("rejects feePercent > 100 or < 0", () => {
    expect(() =>
      CancellationTiersSchema.parse([{ hoursBeforeCheckIn: 0, feePercent: 150 }]),
    ).toThrow();
    expect(() =>
      CancellationTiersSchema.parse([{ hoursBeforeCheckIn: 0, feePercent: -10 }]),
    ).toThrow();
  });

  it("rejects non-integer feePercent", () => {
    expect(() =>
      CancellationTiersSchema.parse([{ hoursBeforeCheckIn: 0, feePercent: 12.5 }]),
    ).toThrow();
  });

  it("CancellationPolicySnapshotSchema round-trips a realistic snapshot", () => {
    const parsed = CancellationPolicySnapshotSchema.parse(snapshot());
    expect(parsed.policyName).toBe("Standard");
    expect(parsed.tiers).toHaveLength(3);
  });
});
