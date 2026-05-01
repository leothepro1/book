/**
 * Phase H — `canSessionTransition` exhaustive matrix tests.
 *
 * Generates the full Cartesian product of (from, to) pairs across
 * all `DraftCheckoutSessionStatus` enum values and asserts the
 * validator returns the expected truthiness, derived from the
 * `SESSION_TRANSITIONS` map. The map is the single source of truth;
 * these tests catch silent edits to the map and accidental
 * regressions where a Phase D/E/I writer adds a new transition that
 * the matrix forgot to allow.
 */

import { describe, it, expect } from "vitest";
import type { DraftCheckoutSessionStatus } from "@prisma/client";

import {
  SESSION_TRANSITIONS,
  canSessionTransition,
} from "./session-transitions";

const ALL_STATUSES: DraftCheckoutSessionStatus[] = [
  "ACTIVE",
  "UNLINKED",
  "EXPIRED",
  "PAID",
  "CANCELLED",
];

describe("canSessionTransition — full Cartesian matrix", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = SESSION_TRANSITIONS[from].has(to);
      it(`${from} → ${to} returns ${expected}`, () => {
        expect(canSessionTransition(from, to)).toBe(expected);
      });
    }
  }
});

describe("canSessionTransition — terminal states", () => {
  it("UNLINKED has zero outbound transitions", () => {
    for (const to of ALL_STATUSES) {
      expect(canSessionTransition("UNLINKED", to)).toBe(false);
    }
  });

  it("PAID has zero outbound transitions", () => {
    for (const to of ALL_STATUSES) {
      expect(canSessionTransition("PAID", to)).toBe(false);
    }
  });

  it("CANCELLED has zero outbound transitions", () => {
    for (const to of ALL_STATUSES) {
      expect(canSessionTransition("CANCELLED", to)).toBe(false);
    }
  });
});

describe("canSessionTransition — self-transitions are rejected", () => {
  for (const status of ALL_STATUSES) {
    it(`${status} → ${status} returns false`, () => {
      expect(canSessionTransition(status, status)).toBe(false);
    });
  }
});

describe("canSessionTransition — v1.3 §5 invariant 12", () => {
  it("EXPIRED → PAID is allowed (money trumps expiry)", () => {
    expect(canSessionTransition("EXPIRED", "PAID")).toBe(true);
  });

  it("EXPIRED → CANCELLED is allowed (cleanup-cron path)", () => {
    expect(canSessionTransition("EXPIRED", "CANCELLED")).toBe(true);
  });

  it("EXPIRED → ACTIVE is rejected (no resurrection)", () => {
    expect(canSessionTransition("EXPIRED", "ACTIVE")).toBe(false);
  });

  it("EXPIRED → UNLINKED is rejected (UNLINKED is a merchant-edit signal, not an expiry signal)", () => {
    expect(canSessionTransition("EXPIRED", "UNLINKED")).toBe(false);
  });
});

describe("canSessionTransition — ACTIVE outbound coverage", () => {
  it("ACTIVE → PAID (Phase H happy path)", () => {
    expect(canSessionTransition("ACTIVE", "PAID")).toBe(true);
  });

  it("ACTIVE → UNLINKED (Phase D unlink)", () => {
    expect(canSessionTransition("ACTIVE", "UNLINKED")).toBe(true);
  });

  it("ACTIVE → EXPIRED (Phase I cleanup-cron)", () => {
    expect(canSessionTransition("ACTIVE", "EXPIRED")).toBe(true);
  });

  it("ACTIVE → CANCELLED (Phase E compensation)", () => {
    expect(canSessionTransition("ACTIVE", "CANCELLED")).toBe(true);
  });
});
