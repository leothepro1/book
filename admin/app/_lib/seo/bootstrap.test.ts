import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./adapters/base", async () => {
  const actual = await vi.importActual<
    typeof import("./adapters/base")
  >("./adapters/base");
  return {
    ...actual,
    registerSeoAdapter: vi.fn(actual.registerSeoAdapter),
  };
});

import {
  _clearSeoAdaptersForTests,
  getAllSeoAdapters,
  registerSeoAdapter,
} from "./adapters/base";
import {
  _resetSeoBootstrapForTests,
  ensureSeoBootstrapped,
} from "./bootstrap";

beforeEach(() => {
  _clearSeoAdaptersForTests();
  _resetSeoBootstrapForTests();
  vi.mocked(registerSeoAdapter).mockClear();
});

// ── Idempotency ──────────────────────────────────────────────

describe("ensureSeoBootstrapped — idempotency", () => {
  it("registers the accommodation + homepage + product adapters on first call", () => {
    ensureSeoBootstrapped();
    const all = getAllSeoAdapters();
    const resourceTypes = all.map((a) => a.resourceType).sort();
    expect(resourceTypes).toEqual(["accommodation", "homepage", "product"]);
  });

  it("calling twice registers each adapter exactly once", () => {
    ensureSeoBootstrapped();
    ensureSeoBootstrapped();
    // One call per adapter on the first bootstrap; zero on subsequent calls.
    expect(registerSeoAdapter).toHaveBeenCalledTimes(3);
  });

  it("calling 10 times registers each adapter exactly once", () => {
    for (let i = 0; i < 10; i++) ensureSeoBootstrapped();
    expect(registerSeoAdapter).toHaveBeenCalledTimes(3);
  });

  it("after _resetSeoBootstrapForTests, a new call re-registers all", () => {
    ensureSeoBootstrapped();
    _resetSeoBootstrapForTests();
    _clearSeoAdaptersForTests();
    ensureSeoBootstrapped();
    // First bootstrap: 3 calls. Second bootstrap after reset: 3 more. Total 6.
    expect(registerSeoAdapter).toHaveBeenCalledTimes(6);
  });
});

// ── Tree-shake resistance (structural test) ──────────────────

describe("ensureSeoBootstrapped — tree-shake resistance", () => {
  /**
   * The real concern behind "tree-shake resistance" is that adapter
   * registration must not depend on a module being imported
   * transitively from an unrelated path. The contract:
   *
   *   `request-cache.ts` — the only SEO entry point consumers
   *   import into app routes — MUST call `ensureSeoBootstrapped()`
   *   before delegating to the resolver. If it doesn't, a build
   *   with dead-code elimination could strip the adapter import
   *   entirely and `getSeoAdapter()` would throw at runtime.
   *
   * A structural test that reads the source file and asserts the
   * call site exists is uglier than a pure-function test but
   * precisely captures the contract. When the contract is
   * structural, so is the test.
   */
  it("request-cache.ts contains a call to ensureSeoBootstrapped", () => {
    const source = readFileSync(
      join(__dirname, "request-cache.ts"),
      "utf-8",
    );
    expect(source).toMatch(/\bensureSeoBootstrapped\s*\(\s*\)/);
    expect(source).toContain('from "./bootstrap"');
  });
});
