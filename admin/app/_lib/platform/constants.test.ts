import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getPlatformBaseDomain, getPlatformProtocol } from "./constants";

describe("getPlatformBaseDomain", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns NEXT_PUBLIC_BASE_DOMAIN when set", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "staging.example.com");
    expect(getPlatformBaseDomain()).toBe("staging.example.com");
  });

  it("returns 'rutgr.com' when env unset", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "");
    expect(getPlatformBaseDomain()).toBe("rutgr.com");
  });
});

describe("getPlatformProtocol", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'https' in production regardless of host", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getPlatformProtocol("localhost:3000")).toBe("https");
    expect(getPlatformProtocol("hotel-x.rutgr.com")).toBe("https");
    expect(getPlatformProtocol(undefined)).toBe("https");
  });

  it("returns 'http' for localhost in dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getPlatformProtocol("localhost:3000")).toBe("http");
    expect(getPlatformProtocol("127.0.0.1:3000")).toBe("http");
  });

  it("returns 'https' for non-localhost in dev (e.g. *.app.github.dev)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getPlatformProtocol("foo-3000.app.github.dev")).toBe("https");
    expect(getPlatformProtocol("hotel-x.rutgr.com")).toBe("https");
  });

  it("returns 'https' when host is undefined in dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getPlatformProtocol(undefined)).toBe("https");
  });
});
