/**
 * Tenant-settings analytics-fragment tests.
 *
 * `getAnalyticsSalt` is the only entry point for reading the salt
 * server-side. Its Phase 1 behavior is "soft" — return `undefined`
 * when missing or malformed, never throw. Phase 3 will tighten this
 * to throw; that change will require these tests to be updated
 * alongside the helper.
 *
 * `generateAnalyticsSalt` produces a 32-char hex string; tests that
 * the output shape and randomness expectations hold.
 */

import { describe, expect, it } from "vitest";

import {
  generateAnalyticsSalt,
  getAnalyticsSalt,
} from "./tenant-settings";

const baseTenant = { id: "tenant_test_1" };

describe("getAnalyticsSalt", () => {
  it("returns the salt when present and valid", () => {
    const salt = "a".repeat(32);
    expect(
      getAnalyticsSalt({
        ...baseTenant,
        settings: { analyticsSalt: salt },
      }),
    ).toBe(salt);
  });

  it("returns undefined when settings is null (Phase 1 — soft)", () => {
    expect(
      getAnalyticsSalt({ ...baseTenant, settings: null }),
    ).toBeUndefined();
  });

  it("returns undefined when settings is an empty object", () => {
    expect(
      getAnalyticsSalt({ ...baseTenant, settings: {} }),
    ).toBeUndefined();
  });

  it("returns undefined when analyticsSalt is missing (Phase 1 — soft)", () => {
    expect(
      getAnalyticsSalt({
        ...baseTenant,
        settings: { theme: { version: 1 } },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when analyticsSalt is non-string", () => {
    expect(
      getAnalyticsSalt({
        ...baseTenant,
        settings: { analyticsSalt: 123 },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when analyticsSalt is shorter than minimum length", () => {
    expect(
      getAnalyticsSalt({
        ...baseTenant,
        settings: { analyticsSalt: "tooshort" },
      }),
    ).toBeUndefined();
  });

  it("returns the salt when settings is a richer object", () => {
    const salt = "f".repeat(32);
    expect(
      getAnalyticsSalt({
        ...baseTenant,
        settings: {
          theme: { version: 1 },
          property: { name: "Test" },
          analyticsSalt: salt,
        },
      }),
    ).toBe(salt);
  });
});

describe("generateAnalyticsSalt", () => {
  it("produces a 32-char hex string", async () => {
    const salt = await generateAnalyticsSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces a different value on each call (cryptographic randomness sanity)", async () => {
    const samples = await Promise.all([
      generateAnalyticsSalt(),
      generateAnalyticsSalt(),
      generateAnalyticsSalt(),
      generateAnalyticsSalt(),
    ]);
    const unique = new Set(samples);
    expect(unique.size).toBe(samples.length);
  });
});
