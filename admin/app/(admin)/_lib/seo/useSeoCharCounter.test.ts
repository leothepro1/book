import { describe, expect, it } from "vitest";

import { useSeoCharCounter } from "./useSeoCharCounter";

describe("useSeoCharCounter", () => {
  it("returns `normal` state + tertiary color when value is within the limit", () => {
    const counter = useSeoCharCounter("Hej!", 70);
    expect(counter.state).toBe("normal");
    expect(counter.color).toBe("var(--admin-text-tertiary)");
    expect(counter.display).toBe("4 av 70 tecken använda");
  });

  it("stays `normal` at exactly the limit — the boundary is inclusive", () => {
    const atMax = "a".repeat(70);
    const counter = useSeoCharCounter(atMax, 70);
    expect(counter.state).toBe("normal");
    expect(counter.display).toBe("70 av 70 tecken använda");
  });

  it("transitions to `error` state + danger color when value exceeds the limit", () => {
    const overMax = "a".repeat(71);
    const counter = useSeoCharCounter(overMax, 70);
    expect(counter.state).toBe("error");
    expect(counter.color).toBe("var(--admin-danger)");
    expect(counter.display).toBe("71 av 70 tecken använda");
  });
});
