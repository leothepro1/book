import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock the env module before importing the token module
vi.mock("@/app/_lib/env", () => ({
  env: {
    UNSUBSCRIBE_SECRET: "test_secret_key_that_is_at_least_32_characters_long",
  },
}));

// Dynamic import after mock is set up
let generateUnsubscribeToken: (tenantId: string, email: string) => string;
let verifyUnsubscribeToken: (tenantId: string, email: string, token: string) => boolean;

beforeAll(async () => {
  const mod = await import("./unsubscribe-token");
  generateUnsubscribeToken = mod.generateUnsubscribeToken;
  verifyUnsubscribeToken = mod.verifyUnsubscribeToken;
});

describe("generateUnsubscribeToken", () => {
  it("produces the same output for the same inputs", () => {
    const a = generateUnsubscribeToken("tenant1", "guest@example.com");
    const b = generateUnsubscribeToken("tenant1", "guest@example.com");
    expect(a).toBe(b);
  });

  it("produces different output for different tenantId", () => {
    const a = generateUnsubscribeToken("tenant1", "guest@example.com");
    const b = generateUnsubscribeToken("tenant2", "guest@example.com");
    expect(a).not.toBe(b);
  });

  it("produces different output for different email", () => {
    const a = generateUnsubscribeToken("tenant1", "alice@example.com");
    const b = generateUnsubscribeToken("tenant1", "bob@example.com");
    expect(a).not.toBe(b);
  });
});

describe("verifyUnsubscribeToken", () => {
  it("returns true for a valid token", () => {
    const token = generateUnsubscribeToken("tenant1", "guest@example.com");
    expect(verifyUnsubscribeToken("tenant1", "guest@example.com", token)).toBe(true);
  });

  it("returns false for a tampered token", () => {
    const token = generateUnsubscribeToken("tenant1", "guest@example.com");
    const tampered = token.slice(0, -2) + "ff";
    expect(verifyUnsubscribeToken("tenant1", "guest@example.com", tampered)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(verifyUnsubscribeToken("tenant1", "guest@example.com", "")).toBe(false);
  });

  it("returns false for a token of wrong length", () => {
    expect(verifyUnsubscribeToken("tenant1", "guest@example.com", "abc")).toBe(false);
  });
});
