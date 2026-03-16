import { describe, it, expect } from "vitest";
import { computeDigest } from "../digest";

describe("computeDigest", () => {
  it("same input always produces same output", () => {
    const input = "Hello, world!";
    expect(computeDigest(input)).toBe(computeDigest(input));
  });

  it("different inputs produce different outputs", () => {
    const a = computeDigest("Hello");
    const b = computeDigest("World");
    expect(a).not.toBe(b);
  });

  it("empty string has a stable digest", () => {
    const d1 = computeDigest("");
    const d2 = computeDigest("");
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{8}$/);
  });

  it("unicode input is handled correctly", () => {
    const d1 = computeDigest("Välkommen till hotellet 🏨");
    const d2 = computeDigest("Välkommen till hotellet 🏨");
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{8}$/);

    // Different unicode strings produce different digests
    const d3 = computeDigest("日本語テスト");
    expect(d3).not.toBe(d1);
  });

  it("returns an 8-character hex string", () => {
    const digest = computeDigest("test");
    expect(digest).toHaveLength(8);
    expect(digest).toMatch(/^[0-9a-f]{8}$/);
  });
});
