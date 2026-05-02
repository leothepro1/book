// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetLoaderContextCacheForTests,
  buildStorefrontContext,
  precomputeUserAgentHash,
  sanitizePageUrl,
} from "./loader-context";

beforeEach(() => {
  _resetLoaderContextCacheForTests();
  // jsdom's sessionStorage is per-test by default.
  window.sessionStorage.clear();
  document.documentElement.lang = "";
});

afterEach(() => {
  _resetLoaderContextCacheForTests();
});

describe("buildStorefrontContext", () => {
  it("returns the canonical 6 fields", () => {
    const ctx = buildStorefrontContext();
    expect(Object.keys(ctx).sort()).toEqual(
      [
        "locale",
        "page_referrer",
        "page_url",
        "session_id",
        "user_agent_hash",
        "viewport",
      ].sort(),
    );
  });

  it("page_url reflects the current location (no query/fragment in test env)", () => {
    const ctx = buildStorefrontContext();
    // jsdom default location has no query/fragment, so sanitized
    // output equals the raw href. The sanitizer's behavior under
    // query/fragment is exercised in the dedicated sanitizePageUrl
    // describe block below.
    expect(ctx.page_url).toBe(window.location.href);
  });

  it("viewport reads window.innerWidth/innerHeight as non-negative integers", () => {
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const ctx = buildStorefrontContext();
    expect(ctx.viewport).toEqual({ width: 1440, height: 900 });
  });

  it("viewport floors fractional pixels and clamps negatives to 0", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024.7, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: -50, configurable: true });
    const ctx = buildStorefrontContext();
    expect(ctx.viewport.width).toBe(1024);
    expect(ctx.viewport.height).toBe(0);
  });

  it("locale prefers <html lang> over navigator.language", () => {
    document.documentElement.lang = "de-DE";
    const lang = vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    const ctx = buildStorefrontContext();
    expect(ctx.locale).toBe("de-DE");
    lang.mockRestore();
  });

  it("locale falls back to navigator.language when lang is missing/short", () => {
    document.documentElement.lang = "";
    const lang = vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    const ctx = buildStorefrontContext();
    expect(ctx.locale).toBe("fr-FR");
    lang.mockRestore();
  });

  it("locale falls back to 'sv' when nothing usable is available", () => {
    document.documentElement.lang = "";
    const lang = vi.spyOn(navigator, "language", "get").mockReturnValue("");
    const ctx = buildStorefrontContext();
    expect(ctx.locale).toBe("sv");
    lang.mockRestore();
  });

  it("localeOverride wins over both lang and navigator.language", () => {
    document.documentElement.lang = "sv";
    const ctx = buildStorefrontContext({ localeOverride: "en" });
    expect(ctx.locale).toBe("en");
  });

  it("session_id is generated and persists across calls in the same tab", () => {
    const a = buildStorefrontContext();
    const b = buildStorefrontContext();
    expect(a.session_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(b.session_id).toBe(a.session_id);
  });

  it("session_id survives across calls and is stable across resets that preserve sessionStorage", () => {
    const a = buildStorefrontContext().session_id;
    _resetLoaderContextCacheForTests(); // resets in-memory cache only
    // sessionStorage still has the value, so the next call reads it.
    const b = buildStorefrontContext().session_id;
    expect(b).toBe(a);
  });

  it("user_agent_hash is 'ua_pending' before precompute, real hash after", async () => {
    const before = buildStorefrontContext().user_agent_hash;
    expect(before).toBe("ua_pending");
    await precomputeUserAgentHash("Mozilla/5.0 jsdom test");
    const after = buildStorefrontContext().user_agent_hash;
    expect(after).toMatch(/^[0-9a-f]{16}$/);
    expect(after).not.toBe("ua_pending");
  });

  it("page_referrer is read from document.referrer (empty string allowed)", () => {
    Object.defineProperty(document, "referrer", { value: "", configurable: true });
    expect(buildStorefrontContext().page_referrer).toBe("");
    Object.defineProperty(document, "referrer", {
      value: "https://google.com/",
      configurable: true,
    });
    expect(buildStorefrontContext().page_referrer).toBe("https://google.com/");
  });

  it("falls back to in-memory session id when sessionStorage throws", () => {
    const orig = window.sessionStorage.getItem;
    window.sessionStorage.getItem = () => {
      throw new Error("private mode");
    };
    try {
      const a = buildStorefrontContext().session_id;
      const b = buildStorefrontContext().session_id;
      expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(b).toBe(a); // in-memory cache returns same id
    } finally {
      window.sessionStorage.getItem = orig;
    }
  });
});

describe("sanitizePageUrl", () => {
  it("returns URL unchanged when there is no query and no fragment", () => {
    expect(sanitizePageUrl("https://apelviken.rutgr.com/stays/svalan")).toBe(
      "https://apelviken.rutgr.com/stays/svalan",
    );
  });

  it("preserves allowlisted utm_* parameters", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/stays/svalan?utm_source=newsletter&utm_medium=email&utm_campaign=spring",
    );
    expect(out).toContain("utm_source=newsletter");
    expect(out).toContain("utm_medium=email");
    expect(out).toContain("utm_campaign=spring");
  });

  it("preserves fbclid and gclid", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/?fbclid=ABC&gclid=XYZ",
    );
    expect(out).toContain("fbclid=ABC");
    expect(out).toContain("gclid=XYZ");
  });

  it("strips non-allowlisted query parameters (PII-bearing)", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/?email=guest%40example.com&utm_source=email",
    );
    expect(out).not.toContain("email=");
    expect(out).toContain("utm_source=email");
  });

  it("strips the URL fragment", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/stays/svalan#booking-form",
    );
    expect(out).not.toContain("#");
    expect(out).toBe("https://apelviken.rutgr.com/stays/svalan");
  });

  it("strips both fragment and disallowed query params on a mixed URL", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/?email=foo&utm_source=newsletter&token=secret#section-2",
    );
    expect(out).not.toContain("email=");
    expect(out).not.toContain("token=");
    expect(out).not.toContain("#");
    expect(out).toContain("utm_source=newsletter");
  });

  it("handles a URL with only disallowed params — produces clean URL with no query", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/?email=foo&token=bar",
    );
    expect(out).toBe("https://apelviken.rutgr.com/");
  });

  it("preserves path and protocol", () => {
    const out = sanitizePageUrl(
      "https://apelviken.rutgr.com/stays/svalan/book?fbclid=A&_blah=B",
    );
    expect(out.startsWith("https://apelviken.rutgr.com/stays/svalan/book")).toBe(
      true,
    );
    expect(out).toContain("fbclid=A");
    expect(out).not.toContain("_blah=");
  });

  it("returns input unchanged for malformed URLs (best-effort)", () => {
    // The schema accepts any non-empty string. We never want sanitization
    // to drop an event — failure mode is "preserve as-is" rather than
    // "throw and lose the event".
    expect(sanitizePageUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("precomputeUserAgentHash", () => {
  it("returns deterministic 16-hex-char output for same UA", async () => {
    const a = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    _resetLoaderContextCacheForTests();
    const b = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different UA strings produce different hashes", async () => {
    const a = await precomputeUserAgentHash("Browser A");
    _resetLoaderContextCacheForTests();
    const b = await precomputeUserAgentHash("Browser B");
    expect(a).not.toBe(b);
  });

  it("is idempotent — second call returns cached value", async () => {
    const a = await precomputeUserAgentHash("ua_x");
    const b = await precomputeUserAgentHash("ua_y"); // ignored, returns cached
    expect(b).toBe(a);
  });
});
