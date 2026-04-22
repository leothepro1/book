import { describe, it, expect } from "vitest";
import { interleaveByGroup } from "./round-robin";

describe("interleaveByGroup", () => {
  it("returns empty for empty input", () => {
    expect(interleaveByGroup([], () => "x")).toEqual([]);
  });

  it("preserves a single group unchanged", () => {
    const items = [
      { id: 1, g: "A" },
      { id: 2, g: "A" },
      { id: 3, g: "A" },
    ];
    expect(interleaveByGroup(items, (i) => i.g)).toEqual(items);
  });

  it("interleaves three groups in round-robin order", () => {
    const items = [
      { id: "a1", g: "A" },
      { id: "a2", g: "A" },
      { id: "a3", g: "A" },
      { id: "a4", g: "A" },
      { id: "b1", g: "B" },
      { id: "c1", g: "C" },
      { id: "c2", g: "C" },
    ];
    const result = interleaveByGroup(items, (i) => i.g);
    expect(result.map((r) => r.id)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "c2",
      "a3",
      "a4",
    ]);
  });

  it("preserves within-group order when re-interleaving", () => {
    const items = [
      { id: "a1", g: "A" },
      { id: "a2", g: "A" },
      { id: "b1", g: "B" },
      { id: "b2", g: "B" },
    ];
    const result = interleaveByGroup(items, (i) => i.g);
    // A1 must come before A2, B1 before B2
    const aIdx1 = result.findIndex((r) => r.id === "a1");
    const aIdx2 = result.findIndex((r) => r.id === "a2");
    const bIdx1 = result.findIndex((r) => r.id === "b1");
    const bIdx2 = result.findIndex((r) => r.id === "b2");
    expect(aIdx1).toBeLessThan(aIdx2);
    expect(bIdx1).toBeLessThan(bIdx2);
  });

  it("prevents a single group from monopolising the output", () => {
    const items = [
      ...Array.from({ length: 1000 }, (_, i) => ({ id: `noisy-${i}`, g: "NOISY" })),
      { id: "quiet-1", g: "QUIET" },
    ];
    const result = interleaveByGroup(items, (i) => i.g, 10);
    expect(result).toHaveLength(10);
    // QUIET's one item must appear in the first 2 positions (round-
    // robin ensures no group dominates).
    const quietIdx = result.findIndex((r) => r.g === "QUIET");
    expect(quietIdx).toBeGreaterThanOrEqual(0);
    expect(quietIdx).toBeLessThanOrEqual(1);
  });

  it("truncates correctly when maxLength < items.length", () => {
    const items = [
      { id: "a1", g: "A" },
      { id: "a2", g: "A" },
      { id: "b1", g: "B" },
      { id: "b2", g: "B" },
      { id: "c1", g: "C" },
    ];
    const result = interleaveByGroup(items, (i) => i.g, 3);
    expect(result.map((r) => r.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("cycles groups in first-seen order even when sizes differ", () => {
    // Group C appears first, then A, then B. The round-robin cycle
    // should be C, A, B — regardless of how many items each has.
    const items = [
      { id: "c1", g: "C" },
      { id: "c2", g: "C" },
      { id: "a1", g: "A" },
      { id: "b1", g: "B" },
    ];
    const result = interleaveByGroup(items, (i) => i.g);
    expect(result.map((r) => r.id)).toEqual(["c1", "a1", "b1", "c2"]);
  });
});
