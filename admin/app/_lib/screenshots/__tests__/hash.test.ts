import { describe, it, expect } from "vitest";
import { computeSettingsHash } from "../hash";

describe("computeSettingsHash", () => {
  it("returns same hash for identical objects", () => {
    const a = { foo: 1, bar: "hello" };
    const b = { foo: 1, bar: "hello" };
    expect(computeSettingsHash(a)).toBe(computeSettingsHash(b));
  });

  it("returns same hash regardless of key order", () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(computeSettingsHash(a)).toBe(computeSettingsHash(b));
  });

  it("returns different hash when a value changes", () => {
    const a = { foo: 1, bar: "hello" };
    const b = { foo: 1, bar: "world" };
    expect(computeSettingsHash(a)).not.toBe(computeSettingsHash(b));
  });

  it("returns 64-character hex string", () => {
    const hash = computeSettingsHash({ test: true });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles nested objects with sorted keys", () => {
    const a = { outer: { z: 1, a: 2 }, name: "test" };
    const b = { name: "test", outer: { a: 2, z: 1 } };
    expect(computeSettingsHash(a)).toBe(computeSettingsHash(b));
  });

  it("handles arrays (order-sensitive)", () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [3, 2, 1] };
    expect(computeSettingsHash(a)).not.toBe(computeSettingsHash(b));
  });

  it("handles null and undefined values", () => {
    const a = { foo: null, bar: undefined };
    const b = { bar: undefined, foo: null };
    expect(computeSettingsHash(a)).toBe(computeSettingsHash(b));
  });
});
