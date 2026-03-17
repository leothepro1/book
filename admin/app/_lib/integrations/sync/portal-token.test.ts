import { describe, it, expect } from "vitest";
import { generatePortalToken } from "./portal-token";

describe("generatePortalToken", () => {
  it("returns a non-empty string", () => {
    const token = generatePortalToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("two calls return different values", () => {
    const a = generatePortalToken();
    const b = generatePortalToken();
    expect(a).not.toBe(b);
  });

  it("is URL-safe (no +, /, = characters)", () => {
    // Run multiple times to reduce flake risk
    for (let i = 0; i < 20; i++) {
      const token = generatePortalToken();
      expect(token).not.toMatch(/[+/=]/);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("has consistent length (base64url of 24 bytes = 32 chars)", () => {
    const token = generatePortalToken();
    expect(token.length).toBe(32);
  });
});
