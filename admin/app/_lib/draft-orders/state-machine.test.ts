import { describe, it, expect } from "vitest";
import type { DraftOrderStatus } from "@prisma/client";
import { DRAFT_TRANSITIONS, canTransition } from "./state-machine";

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
