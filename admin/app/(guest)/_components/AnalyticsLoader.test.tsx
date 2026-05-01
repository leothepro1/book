// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `import "server-only"` blocks importing in test env. Stub it.
vi.mock("server-only", () => ({}));

// Mock next/headers BEFORE importing the component.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Map([["x-vercel-ip-country", "SE"]]) as unknown as {
      get: (k: string) => string | null;
    },
}));

// Mock next/script — render as a marker we can match in JSX output.
vi.mock("next/script", () => ({
  default: (props: { src: string }) => null,
}));

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockStatSync = vi.fn();

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    statSync: (...a: unknown[]) => mockStatSync(...a),
  };
});

const captureMessageMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a: unknown[]) => captureMessageMock(...a),
}));

import {
  AnalyticsLoader,
  _resetAnalyticsLoaderCacheForTests,
} from "./AnalyticsLoader";

beforeEach(() => {
  _resetAnalyticsLoaderCacheForTests();
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
  mockStatSync.mockReset();
  captureMessageMock.mockReset();
});

afterEach(() => {
  _resetAnalyticsLoaderCacheForTests();
});

describe("AnalyticsLoader — graceful degradation (refinement #4)", () => {
  it("returns null when manifest file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await AnalyticsLoader({ tenantId: "tenant_a" });

    expect(result).toBeNull();
    expect(captureMessageMock).toHaveBeenCalledWith(
      "analytics.loader.manifest_incomplete",
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("returns null when manifest is missing required fields", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 1 });
    mockReadFileSync.mockReturnValue(JSON.stringify({ builtAt: "x" }));

    const result = await AnalyticsLoader({ tenantId: "tenant_a" });

    expect(result).toBeNull();
    expect(captureMessageMock).toHaveBeenCalledWith(
      "analytics.loader.manifest_incomplete",
      expect.any(Object),
    );
  });

  it("returns null + Sentry warning when tenantId is empty", async () => {
    const result = await AnalyticsLoader({ tenantId: "" });

    expect(result).toBeNull();
    expect(captureMessageMock).toHaveBeenCalledWith(
      "analytics.loader.tenant_missing",
      expect.any(Object),
    );
  });

  it("returns null + Sentry warning when manifest read throws", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockImplementation(() => {
      throw new Error("disk error");
    });

    const result = await AnalyticsLoader({ tenantId: "tenant_a" });

    expect(result).toBeNull();
    expect(captureMessageMock).toHaveBeenCalledWith(
      "analytics.loader.manifest_read_failed",
      expect.any(Object),
    );
  });

  it("renders inline globals + Script when manifest is complete", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 100 });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        builtAt: "2026-05-01T00:00:00Z",
        runtime: "runtime.aaaa.js",
        loader: "loader.bbbb.js",
      }),
    );

    const result = await AnalyticsLoader({ tenantId: "tenant_apelviken" });

    expect(result).not.toBeNull();
    // Result is a fragment containing an inline script + Script tag.
    // Just assert it isn't null and Sentry wasn't tripped.
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("caches the manifest by mtime — second call does not re-read disk", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 200 });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        runtime: "runtime.x.js",
        loader: "loader.x.js",
      }),
    );

    await AnalyticsLoader({ tenantId: "tenant_a" });
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);

    await AnalyticsLoader({ tenantId: "tenant_a" });
    // mtime unchanged → cache hit → readFileSync NOT called again.
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it("re-reads when mtime changes (build pipeline shipped a new bundle)", async () => {
    mockExistsSync.mockReturnValue(true);
    let mtime = 100;
    mockStatSync.mockImplementation(() => ({ mtimeMs: mtime }));
    mockReadFileSync.mockImplementation(() =>
      JSON.stringify({
        runtime: `runtime.${mtime}.js`,
        loader: `loader.${mtime}.js`,
      }),
    );

    await AnalyticsLoader({ tenantId: "tenant_a" });
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);

    mtime = 200; // simulate new build
    await AnalyticsLoader({ tenantId: "tenant_a" });
    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });
});
