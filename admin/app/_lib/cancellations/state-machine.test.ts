import { describe, it, expect } from "vitest";
import type { CancellationStatus } from "@prisma/client";
import {
  canTransitionCancellation,
  isTerminalCancellationStatus,
  allowsRestart,
} from "./state-machine";

const ALL_STATUSES: readonly CancellationStatus[] = [
  "REQUESTED",
  "OPEN",
  "DECLINED",
  "CANCELED",
  "CLOSED",
  "EXPIRED",
];

describe("canTransitionCancellation", () => {
  it("REQUESTED → OPEN|DECLINED|CANCELED|EXPIRED allowed", () => {
    expect(canTransitionCancellation("REQUESTED", "OPEN")).toBe(true);
    expect(canTransitionCancellation("REQUESTED", "DECLINED")).toBe(true);
    expect(canTransitionCancellation("REQUESTED", "CANCELED")).toBe(true);
    expect(canTransitionCancellation("REQUESTED", "EXPIRED")).toBe(true);
  });

  it("REQUESTED → CLOSED rejected (must go via OPEN)", () => {
    expect(canTransitionCancellation("REQUESTED", "CLOSED")).toBe(false);
  });

  it("OPEN → CLOSED|DECLINED allowed", () => {
    expect(canTransitionCancellation("OPEN", "CLOSED")).toBe(true);
    expect(canTransitionCancellation("OPEN", "DECLINED")).toBe(true);
  });

  it("OPEN → CANCELED rejected (spec: saga cannot be withdrawn mid-flight)", () => {
    expect(canTransitionCancellation("OPEN", "CANCELED")).toBe(false);
  });

  it("all terminal states reject every outgoing transition", () => {
    for (const from of ["DECLINED", "CANCELED", "CLOSED"] as const) {
      for (const to of ALL_STATUSES) {
        expect(canTransitionCancellation(from, to)).toBe(false);
      }
    }
  });

  it("EXPIRED is terminal (restart creates a new request)", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionCancellation("EXPIRED", to)).toBe(false);
    }
  });

  it("self-transition rejected for every status", () => {
    for (const s of ALL_STATUSES) {
      expect(canTransitionCancellation(s, s)).toBe(false);
    }
  });
});

describe("isTerminalCancellationStatus", () => {
  it("DECLINED, CANCELED, CLOSED, EXPIRED are terminal", () => {
    expect(isTerminalCancellationStatus("DECLINED")).toBe(true);
    expect(isTerminalCancellationStatus("CANCELED")).toBe(true);
    expect(isTerminalCancellationStatus("CLOSED")).toBe(true);
    expect(isTerminalCancellationStatus("EXPIRED")).toBe(true);
  });

  it("REQUESTED, OPEN are not terminal", () => {
    expect(isTerminalCancellationStatus("REQUESTED")).toBe(false);
    expect(isTerminalCancellationStatus("OPEN")).toBe(false);
  });
});

describe("allowsRestart", () => {
  it("DECLINED and EXPIRED allow a new request", () => {
    expect(allowsRestart("DECLINED")).toBe(true);
    expect(allowsRestart("EXPIRED")).toBe(true);
  });

  it("CLOSED and CANCELED are absolute terminal", () => {
    expect(allowsRestart("CLOSED")).toBe(false);
    expect(allowsRestart("CANCELED")).toBe(false);
  });

  it("non-terminal statuses do not allow restart (would be block, not restart)", () => {
    expect(allowsRestart("REQUESTED")).toBe(false);
    expect(allowsRestart("OPEN")).toBe(false);
  });
});
