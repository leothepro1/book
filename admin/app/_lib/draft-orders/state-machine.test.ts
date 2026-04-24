import { describe, it, expect } from "vitest";
import type { DraftHoldState, DraftOrderStatus } from "@prisma/client";
import {
  DRAFT_TRANSITIONS,
  HOLD_TRANSITIONS,
  canHoldTransition,
  canTransition,
} from "./state-machine";

const ALL: DraftOrderStatus[] = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "INVOICED",
  "PAID",
  "OVERDUE",
  "COMPLETING",
  "COMPLETED",
  "CANCELLED",
];

describe("DRAFT_TRANSITIONS — allowed successors", () => {
  it("OPEN → INVOICED | PENDING_APPROVAL | CANCELLED", () => {
    expect(DRAFT_TRANSITIONS.OPEN.sort()).toEqual(
      ["CANCELLED", "INVOICED", "PENDING_APPROVAL"].sort(),
    );
  });

  it("PENDING_APPROVAL → APPROVED | REJECTED | CANCELLED", () => {
    expect(DRAFT_TRANSITIONS.PENDING_APPROVAL.sort()).toEqual(
      ["APPROVED", "CANCELLED", "REJECTED"].sort(),
    );
  });

  it("APPROVED → INVOICED | CANCELLED", () => {
    expect(DRAFT_TRANSITIONS.APPROVED.sort()).toEqual(
      ["CANCELLED", "INVOICED"].sort(),
    );
  });

  it("INVOICED → PAID | OVERDUE | CANCELLED", () => {
    expect(DRAFT_TRANSITIONS.INVOICED.sort()).toEqual(
      ["CANCELLED", "OVERDUE", "PAID"].sort(),
    );
  });

  it("OVERDUE → PAID | CANCELLED", () => {
    expect(DRAFT_TRANSITIONS.OVERDUE.sort()).toEqual(
      ["CANCELLED", "PAID"].sort(),
    );
  });

  it("PAID → COMPLETING only", () => {
    expect(DRAFT_TRANSITIONS.PAID).toEqual(["COMPLETING"]);
  });

  it("COMPLETING → COMPLETED only (transient state)", () => {
    expect(DRAFT_TRANSITIONS.COMPLETING).toEqual(["COMPLETED"]);
  });
});

describe("DRAFT_TRANSITIONS — terminal states", () => {
  it("REJECTED is terminal (operator Q4)", () => {
    expect(DRAFT_TRANSITIONS.REJECTED).toEqual([]);
  });

  it("COMPLETED is terminal", () => {
    expect(DRAFT_TRANSITIONS.COMPLETED).toEqual([]);
  });

  it("CANCELLED is terminal", () => {
    expect(DRAFT_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("canTransition — truth table", () => {
  it("returns true for every allowed transition", () => {
    for (const from of ALL) {
      for (const to of DRAFT_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("returns false for every disallowed transition", () => {
    for (const from of ALL) {
      const allowed = new Set(DRAFT_TRANSITIONS[from]);
      for (const to of ALL) {
        if (!allowed.has(to)) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it("returns false for unknown from state (fails closed)", () => {
    expect(canTransition("UNKNOWN" as DraftOrderStatus, "OPEN")).toBe(false);
  });

  it("self-transitions are rejected by default (no loopback in map)", () => {
    for (const s of ALL) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

// ── HOLD_TRANSITIONS (FAS 6.5C) ─────────────────────────────

const HOLD_ALL: DraftHoldState[] = [
  "NOT_PLACED",
  "PLACING",
  "PLACED",
  "RELEASED",
  "FAILED",
  "CONFIRMED",
];

describe("HOLD_TRANSITIONS — allowed successors", () => {
  it("NOT_PLACED → PLACING only", () => {
    expect(HOLD_TRANSITIONS.NOT_PLACED).toEqual(["PLACING"]);
  });

  it("PLACING → PLACED | FAILED", () => {
    expect(HOLD_TRANSITIONS.PLACING.sort()).toEqual(["FAILED", "PLACED"].sort());
  });

  it("PLACED → RELEASED | CONFIRMED", () => {
    expect(HOLD_TRANSITIONS.PLACED.sort()).toEqual(
      ["CONFIRMED", "RELEASED"].sort(),
    );
  });

  it("FAILED → PLACING | RELEASED (retry + cleanup)", () => {
    expect(HOLD_TRANSITIONS.FAILED.sort()).toEqual(
      ["PLACING", "RELEASED"].sort(),
    );
  });
});

describe("HOLD_TRANSITIONS — terminals", () => {
  it("RELEASED is terminal", () => {
    expect(HOLD_TRANSITIONS.RELEASED).toEqual([]);
  });

  it("CONFIRMED is terminal", () => {
    expect(HOLD_TRANSITIONS.CONFIRMED).toEqual([]);
  });
});

describe("canHoldTransition — truth table", () => {
  it("returns true for every allowed transition", () => {
    for (const from of HOLD_ALL) {
      for (const to of HOLD_TRANSITIONS[from]) {
        expect(canHoldTransition(from, to)).toBe(true);
      }
    }
  });

  it("returns false for every disallowed transition", () => {
    for (const from of HOLD_ALL) {
      const allowed = new Set(HOLD_TRANSITIONS[from]);
      for (const to of HOLD_ALL) {
        if (!allowed.has(to)) {
          expect(canHoldTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it("rejects unknown from state (fails closed)", () => {
    expect(canHoldTransition("UNKNOWN" as DraftHoldState, "PLACED")).toBe(false);
  });

  it("self-transitions are rejected (no loopback in map)", () => {
    for (const s of HOLD_ALL) {
      expect(canHoldTransition(s, s)).toBe(false);
    }
  });

  it("rejects the ghost-transition PLACED → FAILED (audit §4)", () => {
    // Mews auto-expiry is observed via the sweep cron, which writes
    // RELEASED. Direct PLACED → FAILED is never valid.
    expect(canHoldTransition("PLACED", "FAILED")).toBe(false);
  });

  it("rejects RELEASED → PLACING (terminal, admin must re-add line)", () => {
    expect(canHoldTransition("RELEASED", "PLACING")).toBe(false);
  });
});
