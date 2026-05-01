// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DISPATCH_URL,
  dispatchBeacon,
  dispatchKeepalive,
} from "./beacon";
import type { RequestEnvelope } from "./worker-types";

const ENVELOPE: RequestEnvelope = {
  event_id: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZB",
  event_name: "page_viewed",
  schema_version: "0.1.0",
  occurred_at: "2026-05-01T13:00:00.000Z",
  payload: { page_url: "https://x.rutgr.com/", page_type: "stay" },
};

let originalSendBeacon: ((url: string, data?: BodyInit) => boolean) | undefined;
let originalFetch: typeof fetch;

beforeEach(() => {
  originalSendBeacon = navigator.sendBeacon;
  originalFetch = global.fetch;
});

afterEach(() => {
  if (originalSendBeacon) {
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      configurable: true,
    });
  }
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("dispatchKeepalive", () => {
  it("calls fetch with keepalive: true and content-type application/json", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = dispatchKeepalive(ENVELOPE);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(DEFAULT_DISPATCH_URL);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(ENVELOPE);
  });

  it("returns true even when fetch rejects (caller doesn't await)", () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(dispatchKeepalive(ENVELOPE)).toBe(true);
  });

  it("returns false when fetch throws synchronously", () => {
    global.fetch = (() => {
      throw new Error("synchronous throw");
    }) as unknown as typeof fetch;
    expect(dispatchKeepalive(ENVELOPE)).toBe(false);
  });

  it("uses the custom URL override when provided", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    global.fetch = fetchMock as unknown as typeof fetch;
    dispatchKeepalive(ENVELOPE, "/custom/path");
    expect(fetchMock.mock.calls[0]![0]).toBe("/custom/path");
  });
});

describe("dispatchBeacon", () => {
  it("returns true when navigator.sendBeacon accepts the request", () => {
    const beaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconMock,
      configurable: true,
    });

    const ok = dispatchBeacon(ENVELOPE);

    expect(ok).toBe(true);
    expect(beaconMock).toHaveBeenCalledTimes(1);
    const [url, blob] = beaconMock.mock.calls[0]!;
    expect(url).toBe(DEFAULT_DISPATCH_URL);
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("application/json");
  });

  it("returns false when sendBeacon is unavailable (legacy browser)", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
    });
    expect(dispatchBeacon(ENVELOPE)).toBe(false);
  });

  it("returns false when sendBeacon throws", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: () => {
        throw new Error("quota exceeded");
      },
      configurable: true,
    });
    expect(dispatchBeacon(ENVELOPE)).toBe(false);
  });

  it("returns false when sendBeacon refuses (returns false itself)", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: () => false,
      configurable: true,
    });
    expect(dispatchBeacon(ENVELOPE)).toBe(false);
  });

  it("body is JSON-stringified envelope wrapped in a Blob (via constructor spy)", () => {
    const blobSpy = vi.spyOn(globalThis, "Blob");
    const beaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconMock,
      configurable: true,
    });
    dispatchBeacon(ENVELOPE);
    expect(blobSpy).toHaveBeenCalledTimes(1);
    const [parts, opts] = blobSpy.mock.calls[0]!;
    expect(opts).toEqual({ type: "application/json" });
    // parts is BlobPart[] — the first part is our JSON string.
    expect(parts).toHaveLength(1);
    expect(JSON.parse(parts![0] as string)).toEqual(ENVELOPE);
  });
});

// ── Refinement #6 — track() during pagehide must use sendBeacon ────

/**
 * The unload fast path is the most-likely-broken edge case.
 * Per the plan we test it explicitly: simulate pagehide (sets the
 * loader's `unloading=true`), then call `bedfrontAnalytics.track()`
 * within the pagehide handler. Assert sendBeacon was called and
 * fetch was NOT.
 */
describe("loader.track() during pagehide (refinement #6)", () => {
  it("routes through sendBeacon, not fetch, when called during pagehide", async () => {
    // jsdom needs a clean cookie + DOM. Set up consent + manifest
    // globals that the loader expects.
    document.cookie = `bf_consent=${encodeURIComponent(
      JSON.stringify({ essential: true, analytics: true, marketing: false }),
    )}; path=/`;

    const w = window as unknown as {
      __bedfront_geo: string;
      __bedfront_runtime: { runtime: string; loader: string; tenantId: string };
    };
    w.__bedfront_geo = "US"; // non-EEA → grant by default
    w.__bedfront_runtime = {
      runtime: "runtime.x.js",
      loader: "loader.x.js",
      tenantId: "tenant_apelviken",
    };

    const beaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconMock,
      configurable: true,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const blobSpy = vi.spyOn(globalThis, "Blob");

    // Stub Worker — the loader tries to spawn one for non-unload events,
    // but during pagehide we go inline so it shouldn't be reached.
    // Use a regular constructor function so `new Worker(...)` doesn't
    // throw (arrow-function mocks aren't constructable).
    function WorkerCtor(this: object) {
      Object.assign(this, {
        addEventListener: () => {},
        postMessage: () => {},
        terminate: () => {},
      });
    }
    (global as unknown as { Worker: unknown }).Worker = WorkerCtor;

    // Reset module state so loader's closure variables (worker,
    // unloading, bootstrapped, …) are fresh per test.
    vi.resetModules();
    const loaderMod = await import("./loader");
    void loaderMod; // module side-effects bootstrap

    // Wait for bootstrap's async UA hash precompute to resolve.
    await new Promise((r) => setTimeout(r, 50));

    // Verify the API is exposed.
    const api = (window as unknown as { bedfrontAnalytics?: {
      track: (n: string, p: Record<string, unknown>) => void;
      pageView: () => void;
    } }).bedfrontAnalytics;
    expect(api).toBeDefined();

    // Drain the auto-pageView that bootstrap fires (uses worker, so
    // sendBeacon was not invoked yet). Reset the mocks afterwards so
    // the assertion below targets only the pagehide-time call.
    beaconMock.mockClear();
    fetchMock.mockClear();

    // Fire pagehide — sets unloading=true.
    window.dispatchEvent(new Event("pagehide"));

    // Within the pagehide handler-equivalent, call track().
    api!.track("page_viewed", {
      page_type: "stay",
    });

    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    // Assert the envelope reached sendBeacon with the correct shape
    // via Blob-constructor spy (jsdom Blob lacks .text()/.arrayBuffer()).
    expect(blobSpy).toHaveBeenCalled();
    const [parts, opts] = blobSpy.mock.calls[blobSpy.mock.calls.length - 1]!;
    expect(opts).toEqual({ type: "application/json" });
    const env = JSON.parse(parts![0] as string);
    expect(env.event_name).toBe("page_viewed");
    expect(env.schema_version).toBe("0.1.0");
    expect(env.event_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(env.payload.page_type).toBe("stay");
    // tenantId MUST NOT appear on the wire — same security guard as
    // the worker path.
    const wireBytes = parts![0] as string;
    expect(wireBytes).not.toContain("tenant_apelviken");
    expect(beaconMock.mock.calls[0]![0]).toBe(DEFAULT_DISPATCH_URL);
  });
});
