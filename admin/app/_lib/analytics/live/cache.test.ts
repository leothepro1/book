/**
 * withRedisCache — 5 fall per recon §4 B.2:
 *   1. miss → fetcher runs, set called, source: "fresh"
 *   2. hit → fetcher NOT called, source: "cache"
 *   3. get throws → log warn, fetcher runs, source: "fresh"
 *   4. set throws (after fetcher succeeds) → log warn, return fresh
 *   5. dev-mode (Proxy returns null on get) → pass-through, source: "fresh"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock("@/app/_lib/redis/client", () => ({
  redis: mockRedis,
}));

const logSpy = vi.fn();
vi.mock("@/app/_lib/logger", () => ({
  log: (level: string, event: string, ctx: Record<string, unknown>) =>
    logSpy(level, event, ctx),
}));

const { withRedisCache } = await import("./cache");

describe("withRedisCache", () => {
  beforeEach(() => {
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    logSpy.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Fall 1 — miss → fetcher runs, set called, source: fresh", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn(async () => 42);

    const result = await withRedisCache("k1", 60, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(mockRedis.get).toHaveBeenCalledWith("k1");
    expect(mockRedis.set).toHaveBeenCalledWith("k1", "42", { ex: 60 });
    expect(result).toEqual({ value: 42, source: "fresh" });
  });

  it("Fall 2 — hit → fetcher NOT called, source: cache", async () => {
    mockRedis.get.mockResolvedValue('"cached-value"');

    const fetcher = vi.fn(async () => "fresh-value");

    const result = await withRedisCache("k2", 60, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(result).toEqual({ value: "cached-value", source: "cache" });
  });

  it("Fall 2b — hit returns object directly (Upstash auto-deserialises)", async () => {
    // Upstash REST sometimes returns the parsed object, not the JSON
    // string. The helper must accept both shapes.
    const cachedObj = { visitorsNow: 7 };
    mockRedis.get.mockResolvedValue(cachedObj);

    const fetcher = vi.fn();

    const result = await withRedisCache("k2b", 60, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({ value: cachedObj, source: "cache" });
  });

  it("Fall 3 — get throws → log warn, fetcher runs, source: fresh", async () => {
    mockRedis.get.mockRejectedValue(new Error("redis-down"));
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn(async () => "fresh-after-error");

    const result = await withRedisCache("k3", 60, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: "fresh-after-error", source: "fresh" });
    expect(logSpy).toHaveBeenCalledWith(
      "warn",
      "analytics.live_cache.get_failed",
      expect.objectContaining({ key: "k3", error: "redis-down" }),
    );
  });

  it("Fall 4 — set throws after fetcher succeeded → log warn, return fresh", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockRejectedValue(new Error("redis-write-down"));

    const fetcher = vi.fn(async () => 99);

    const result = await withRedisCache("k4", 60, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: 99, source: "fresh" });
    expect(logSpy).toHaveBeenCalledWith(
      "warn",
      "analytics.live_cache.set_failed",
      expect.objectContaining({ key: "k4", error: "redis-write-down" }),
    );
  });

  it("Fall 5 — dev-mode (Proxy returns null on get) → pass-through fresh", async () => {
    // The dev-mode Proxy in app/_lib/redis/client.ts:14-23 resolves
    // every method to Promise.resolve(null). For get, that means cache
    // miss; for set, the result is null (not "OK") but no error is
    // thrown.
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(null);

    const fetcher = vi.fn(async () => "dev-mode-fresh");

    const result = await withRedisCache("k5", 60, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: "dev-mode-fresh", source: "fresh" });
    // No warn — null return from dev Proxy is the expected shape, not
    // an error.
    expect(logSpy).not.toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("set_failed"),
      expect.anything(),
    );
  });

  it("Fall 6 — un-parseable string from cache → falls through to fetcher", async () => {
    // Defense-in-depth: if some other writer poisons the cache key
    // with non-JSON data, we don't crash — we treat as miss and
    // overwrite on the next set.
    mockRedis.get.mockResolvedValue("not-valid-json-{");
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn(async () => "recovered-value");

    const result = await withRedisCache("k6", 60, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: "recovered-value", source: "fresh" });
    expect(logSpy).toHaveBeenCalledWith(
      "warn",
      "analytics.live_cache.parse_failed",
      expect.objectContaining({ key: "k6" }),
    );
  });
});
