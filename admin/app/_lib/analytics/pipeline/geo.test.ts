/**
 * Pipeline geo helper tests (PR-X3b).
 *
 * The MaxMind GeoLite2 native binding is not available in the test
 * environment — we mock the dynamic import. Tests cover:
 *
 *   1. DB present + matching IP → { country, city }
 *   2. DB present + lookup throws (private/reserved IP) → null
 *   3. DB present + lookup result missing country → null
 *   4. DB present + lookup result missing city → null
 *   5. DB ABSENT (file missing) → null + structured log
 *   6. IPv4-mapped IPv6 prefix stripped before lookup
 *   7. "unknown" IP string → null without invoking the reader
 *   8. Empty IP string → null without invoking the reader
 *
 * Privacy invariants asserted alongside:
 *   - log() emits NEVER include the IP or city.
 *   - return type structurally lacks lat/lng — tsc-enforced via
 *     the `GeoContext` interface; we additionally assert the
 *     return object has only the two expected keys at runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @maxmind/geoip2-node before importing the helper. Tests
// override the mock per-case via vi.mocked(...).
vi.mock("@maxmind/geoip2-node", () => ({
  Reader: {
    open: vi.fn(),
  },
}));

// Mock the structured logger so we can assert on log calls without
// piping JSON into the test runner's stdout.
vi.mock("@/app/_lib/logger", () => ({
  log: vi.fn(),
}));

// "DB absent" is driven by `Reader.open` rejecting (e.g. ENOENT) —
// no separate fs mock needed. Tests that want the DB-absent branch
// override Reader.open with a rejection.

import { Reader } from "@maxmind/geoip2-node";

import { log } from "@/app/_lib/logger";

import {
  _resetGeoCacheForTests,
  resolveGeoForContext,
} from "./geo";

const TENANT = "cverify000000000000000000";

beforeEach(() => {
  _resetGeoCacheForTests();
  vi.mocked(log).mockClear();
});

afterEach(() => {
  _resetGeoCacheForTests();
  vi.restoreAllMocks();
});

function mockReader(impl: (ip: string) => unknown): void {
  vi.mocked(Reader.open).mockResolvedValue({
    city: vi.fn(impl),
  } as unknown as Awaited<ReturnType<typeof Reader.open>>);
}

describe("resolveGeoForContext — happy paths", () => {
  it("returns { country, city } for a matching IP", async () => {
    mockReader(() => ({
      country: { isoCode: "SE" },
      city: { names: { en: "Apelviken" } },
    }));
    const result = await resolveGeoForContext("203.0.113.42", TENANT);
    expect(result).toEqual({ country: "SE", city: "Apelviken" });
  });

  it("strips the IPv4-mapped IPv6 prefix before calling MaxMind", async () => {
    let receivedIp: string | undefined;
    mockReader((ip) => {
      receivedIp = ip;
      return {
        country: { isoCode: "SE" },
        city: { names: { en: "Apelviken" } },
      };
    });
    await resolveGeoForContext("::ffff:203.0.113.42", TENANT);
    expect(receivedIp).toBe("203.0.113.42");
  });

  it("returns ONLY country + city — no lat/lng leakage in the return shape", async () => {
    mockReader(() => ({
      country: { isoCode: "SE" },
      city: { names: { en: "Apelviken" } },
      // Even if MaxMind returns location, the helper must not
      // surface it. This is the structural privacy guarantee.
      location: { latitude: 57.13, longitude: 12.31 },
    }));
    const result = await resolveGeoForContext("203.0.113.42", TENANT);
    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual(["city", "country"]);
  });

  it("logs `analytics.geo.resolved` with country only — never IP or city", async () => {
    mockReader(() => ({
      country: { isoCode: "SE" },
      city: { names: { en: "Apelviken" } },
    }));
    await resolveGeoForContext("203.0.113.42", TENANT);
    const calls = vi.mocked(log).mock.calls;
    const resolvedLog = calls.find(([, event]) => event === "analytics.geo.resolved");
    expect(resolvedLog).toBeDefined();
    const ctx = resolvedLog![2] as Record<string, unknown> | undefined;
    expect(ctx).toEqual({ tenantId: TENANT, country: "SE" });
    // Privacy invariant — no IP or city in any log call.
    for (const [, , logCtx] of calls) {
      const flat = JSON.stringify(logCtx ?? {});
      expect(flat).not.toContain("203.0.113.42");
      expect(flat).not.toContain("Apelviken");
    }
  });
});

describe("resolveGeoForContext — null paths", () => {
  it("returns null and logs `geo.unavailable` when the GeoLite2 DB is absent (Reader.open rejects)", async () => {
    // Production code path for missing DB: Reader.open raises ENOENT
    // → caught in the lazy-load → reader cached as null → next call
    // logs `geo.unavailable` with reason "reader_unavailable".
    vi.mocked(Reader.open).mockRejectedValue(
      Object.assign(new Error("ENOENT: GeoLite2-City.mmdb"), { code: "ENOENT" }),
    );
    const result = await resolveGeoForContext("203.0.113.42", TENANT);
    expect(result).toBeNull();
    const calls = vi.mocked(log).mock.calls;
    const unavailableLog = calls.find(([, event]) => event === "analytics.geo.unavailable");
    expect(unavailableLog).toBeDefined();
    expect(unavailableLog![2]).toEqual({
      tenantId: TENANT,
      reason: "reader_unavailable",
    });
  });

  it("returns null when MaxMind lookup throws (private/reserved IP)", async () => {
    mockReader(() => {
      throw new Error("address is in a reserved range");
    });
    const result = await resolveGeoForContext("10.0.0.1", TENANT);
    expect(result).toBeNull();
  });

  it("returns null when MaxMind result is missing country", async () => {
    mockReader(() => ({
      country: { isoCode: undefined },
      city: { names: { en: "Apelviken" } },
    }));
    const result = await resolveGeoForContext("203.0.113.42", TENANT);
    expect(result).toBeNull();
  });

  it("returns null when MaxMind result is missing city", async () => {
    mockReader(() => ({
      country: { isoCode: "SE" },
      city: { names: { en: undefined } },
    }));
    const result = await resolveGeoForContext("203.0.113.42", TENANT);
    expect(result).toBeNull();
  });

  it('returns null for "unknown" IP without invoking the reader', async () => {
    const cityFn = vi.fn();
    vi.mocked(Reader.open).mockResolvedValue({
      city: cityFn,
    } as unknown as Awaited<ReturnType<typeof Reader.open>>);
    const result = await resolveGeoForContext("unknown", TENANT);
    expect(result).toBeNull();
    expect(cityFn).not.toHaveBeenCalled();
  });

  it("returns null for empty IP without invoking the reader", async () => {
    const cityFn = vi.fn();
    vi.mocked(Reader.open).mockResolvedValue({
      city: cityFn,
    } as unknown as Awaited<ReturnType<typeof Reader.open>>);
    const result = await resolveGeoForContext("", TENANT);
    expect(result).toBeNull();
    expect(cityFn).not.toHaveBeenCalled();
  });

  it("never throws — Reader.open rejection becomes null", async () => {
    vi.mocked(Reader.open).mockRejectedValue(new Error("native binding missing"));
    await expect(
      resolveGeoForContext("203.0.113.42", TENANT),
    ).resolves.toBeNull();
  });
});
