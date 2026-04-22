import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Redis client mock ───────────────────────────────────────

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDel = vi.fn();

vi.mock("./client", () => ({
  redis: {
    set: (...a: unknown[]) => mockSet(...a),
    get: (...a: unknown[]) => mockGet(...a),
    del: (...a: unknown[]) => mockDel(...a),
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

// ── Environment control ────────────────────────────────────
//
// The lock module reads env vars at import time, so we need to set
// them BEFORE the dynamic import. We simulate production mode here
// so the Redis path runs; dev-mode bypass is a separate behavior
// covered by its own assertion.

const origNodeEnv = process.env.NODE_ENV;
const origUrl = process.env.UPSTASH_REDIS_REST_URL;
const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

(process.env as Record<string, string>).NODE_ENV = "production";
process.env.UPSTASH_REDIS_REST_URL = "https://fake-redis.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

const { acquireLock, releaseLock, withLock } = await import("./lock");

// Restore after import so other tests are unaffected
(process.env as Record<string, string>).NODE_ENV = origNodeEnv ?? "test";
if (origUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
else process.env.UPSTASH_REDIS_REST_URL = origUrl;
if (origToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
else process.env.UPSTASH_REDIS_REST_TOKEN = origToken;

// ── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acquireLock", () => {
  it("returns a handle when SET NX EX succeeds", async () => {
    mockSet.mockResolvedValueOnce("OK");

    const handle = await acquireLock("test:key", 60);

    expect(handle).not.toBeNull();
    expect(handle!.key).toBe("test:key");
    expect(handle!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(mockSet).toHaveBeenCalledWith(
      "test:key",
      expect.any(String),
      { nx: true, ex: 60 },
    );
  });

  it("returns null when SET NX returns nil (lock held)", async () => {
    mockSet.mockResolvedValueOnce(null);

    const handle = await acquireLock("test:key", 60);

    expect(handle).toBeNull();
  });

  it("returns null when Redis throws (fail-safe)", async () => {
    mockSet.mockRejectedValueOnce(new Error("Redis down"));

    const handle = await acquireLock("test:key", 60);

    expect(handle).toBeNull();
  });
});

describe("releaseLock", () => {
  it("deletes the key only when the stored token matches", async () => {
    mockSet.mockResolvedValueOnce("OK");
    const handle = await acquireLock("test:key", 60);
    mockGet.mockResolvedValueOnce(handle!.token);
    mockDel.mockResolvedValueOnce(1);

    await releaseLock(handle!);

    expect(mockGet).toHaveBeenCalledWith("test:key");
    expect(mockDel).toHaveBeenCalledWith("test:key");
  });

  it("does NOT delete the key when stored token is different (lock stolen)", async () => {
    mockSet.mockResolvedValueOnce("OK");
    const handle = await acquireLock("test:key", 60);
    mockGet.mockResolvedValueOnce("different-token");

    await releaseLock(handle!);

    expect(mockDel).not.toHaveBeenCalled();
  });

  it("swallows Redis errors on release (never throws)", async () => {
    mockSet.mockResolvedValueOnce("OK");
    const handle = await acquireLock("test:key", 60);
    mockGet.mockRejectedValueOnce(new Error("Redis down"));

    await expect(releaseLock(handle!)).resolves.toBeUndefined();
  });
});

describe("withLock", () => {
  it("runs fn and releases the lock on success", async () => {
    mockSet.mockResolvedValueOnce("OK");
    mockGet.mockImplementation(async () => (mockSet.mock.calls[0]?.[1] as string));

    const result = await withLock("test:key", 60, async () => "done");

    expect(result).toBe("done");
    expect(mockDel).toHaveBeenCalled();
  });

  it("releases the lock even when fn throws", async () => {
    mockSet.mockResolvedValueOnce("OK");
    mockGet.mockImplementation(async () => (mockSet.mock.calls[0]?.[1] as string));

    await expect(
      withLock("test:key", 60, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(mockDel).toHaveBeenCalled();
  });

  it("calls onSkip when lock cannot be acquired", async () => {
    mockSet.mockResolvedValueOnce(null);

    const skipSpy = vi.fn(async () => "skipped");
    const result = await withLock("test:key", 60, async () => "ran", skipSpy);

    expect(result).toBe("skipped");
    expect(skipSpy).toHaveBeenCalledOnce();
  });

  it("returns null when lock cannot be acquired and no onSkip", async () => {
    mockSet.mockResolvedValueOnce(null);

    const result = await withLock("test:key", 60, async () => "ran");

    expect(result).toBeNull();
  });
});
