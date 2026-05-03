// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetLoaderContextCacheForTests,
  buildStorefrontContext,
  clearSessionId,
  getOrCreateLandingPage,
  getOrCreateVisitorId,
  isSessionIdle,
  markSessionEmit,
  precomputeUserAgentHash,
  readPriorConsentDecision,
  sanitizePageUrl,
  writePriorConsentDecision,
} from "./loader-context";

beforeEach(() => {
  _resetLoaderContextCacheForTests();
  // jsdom's sessionStorage and localStorage are per-test by default
  // but we clear explicitly so tests that share-mutate window APIs
  // (private-mode simulators) see a deterministic baseline.
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.documentElement.lang = "";
});

afterEach(() => {
  _resetLoaderContextCacheForTests();
});

describe("buildStorefrontContext", () => {
  it("returns the canonical 8 fields (Phase 3.6: + visitor_id, landing_page)", () => {
    const ctx = buildStorefrontContext();
    expect(Object.keys(ctx).sort()).toEqual(
      [
        "landing_page",
        "locale",
        "page_referrer",
        "page_url",
        "session_id",
        "user_agent_hash",
        "viewport",
        "visitor_id",
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
  beforeEach(() => {
    // Default each test to no salt — explicit setSalt below where needed.
    setSalt(undefined);
  });

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

  it("same UA + same salt → same hash (per-tenant stability)", async () => {
    setSalt("salt_apelviken_xxxxxxxxxxxxxxxx");
    const a = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    _resetLoaderContextCacheForTests();
    setSalt("salt_apelviken_xxxxxxxxxxxxxxxx");
    const b = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    expect(a).toBe(b);
  });

  it("same UA + different salt → different hashes (cross-tenant isolation)", async () => {
    setSalt("salt_tenant_aaaa");
    const a = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    _resetLoaderContextCacheForTests();
    setSalt("salt_tenant_bbbb");
    const b = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    expect(a).not.toBe(b);
  });

  it("absent salt produces structurally-valid 16-char hex (unsalted fallback)", async () => {
    setSalt(undefined);
    const hash = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("empty salt is treated identically to absent (both → unsalted)", async () => {
    setSalt(undefined);
    const a = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    _resetLoaderContextCacheForTests();
    setSalt("");
    const b = await precomputeUserAgentHash("Mozilla/5.0 jsdom");
    expect(a).toBe(b);
  });

  it("calls onMissingSalt callback when salt is absent", async () => {
    setSalt(undefined);
    const onMissingSalt = vi.fn();
    await precomputeUserAgentHash("ua_x", onMissingSalt);
    expect(onMissingSalt).toHaveBeenCalledOnce();
  });

  it("does NOT call onMissingSalt when salt is present", async () => {
    setSalt("salt_present_xxxxxxxxxxxxxxxx");
    const onMissingSalt = vi.fn();
    await precomputeUserAgentHash("ua_x", onMissingSalt);
    expect(onMissingSalt).not.toHaveBeenCalled();
  });

  it("calls onMissingSalt when salt is empty string", async () => {
    setSalt("");
    const onMissingSalt = vi.fn();
    await precomputeUserAgentHash("ua_x", onMissingSalt);
    expect(onMissingSalt).toHaveBeenCalledOnce();
  });
});

/** Helper: install a salt on `window.__bedfront_analytics_salt`. */
function setSalt(value: string | undefined): void {
  const w = window as unknown as { __bedfront_analytics_salt?: string };
  if (value === undefined) {
    delete w.__bedfront_analytics_salt;
  } else {
    w.__bedfront_analytics_salt = value;
  }
}

describe("session_id rotation — Trigger 1 (30-min idle, on emit)", () => {
  it("isSessionIdle returns false when no last-emit timestamp is recorded", () => {
    expect(isSessionIdle(Date.now())).toBe(false);
  });

  it("isSessionIdle returns false when last emit is < 30 min ago", () => {
    const now = 1_700_000_000_000;
    markSessionEmit(now - 29 * 60 * 1000);
    expect(isSessionIdle(now)).toBe(false);
  });

  it("isSessionIdle returns true when last emit is > 30 min ago", () => {
    const now = 1_700_000_000_000;
    markSessionEmit(now - 31 * 60 * 1000);
    expect(isSessionIdle(now)).toBe(true);
  });

  it("clearSessionId drops bf_sid and bf_session_last_emit_at", () => {
    // Seed a session id + emit timestamp.
    buildStorefrontContext();
    markSessionEmit(Date.now());
    expect(window.sessionStorage.getItem("bf_sid")).not.toBeNull();
    expect(window.sessionStorage.getItem("bf_session_last_emit_at")).not.toBeNull();

    clearSessionId();

    expect(window.sessionStorage.getItem("bf_sid")).toBeNull();
    expect(window.sessionStorage.getItem("bf_session_last_emit_at")).toBeNull();
  });

  it("after clearSessionId + idle clear, next buildStorefrontContext() mints a different id", () => {
    const a = buildStorefrontContext().session_id;
    clearSessionId();
    const b = buildStorefrontContext().session_id;
    expect(a).not.toBe(b);
    expect(b).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe("session_id rotation — Trigger 2 (consent revoke + regrant)", () => {
  it("readPriorConsentDecision returns null when nothing recorded", () => {
    expect(readPriorConsentDecision()).toBeNull();
  });

  it("write/read round-trip works for 'grant' and 'deny'", () => {
    writePriorConsentDecision("grant");
    expect(readPriorConsentDecision()).toBe("grant");
    writePriorConsentDecision("deny");
    expect(readPriorConsentDecision()).toBe("deny");
  });

  it("readPriorConsentDecision is null after sessionStorage.clear (tab close + reopen simulator)", () => {
    writePriorConsentDecision("grant");
    window.sessionStorage.clear();
    expect(readPriorConsentDecision()).toBeNull();
  });

  // Consumer-side test (loader.ts maybeRotateOnConsentTransition) is
  // covered indirectly by the clearSessionId regen test above plus
  // the writePriorConsentDecision integration. The deny→grant
  // detection logic itself is just a comparison, exercised by the
  // emit-path integration tests in loader.test.ts (future PR — when
  // emit-sites land, those tests will assert the rotation fires
  // end-to-end through track()).
});

describe("session_id rotation — Trigger 3 (tab close + reopen)", () => {
  it("sessionStorage.clear simulates tab close — next session_id is fresh", () => {
    const a = buildStorefrontContext().session_id;
    window.sessionStorage.clear();
    _resetLoaderContextCacheForTests(); // also clears in-memory cache
    const b = buildStorefrontContext().session_id;
    expect(a).not.toBe(b);
  });
});

// ── Phase 3.6: visitor_id (persistent, 2-year, localStorage) ────────

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISITOR_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;

describe("getOrCreateVisitorId (Phase 3.6)", () => {
  it("mints a UUID v4 on first call and persists { value, createdAt } to localStorage", () => {
    const before = window.localStorage.getItem("bf_vid");
    expect(before).toBeNull();

    const now = 1_700_000_000_000;
    const id = getOrCreateVisitorId(now);

    expect(id).toMatch(UUID_V4_RE);
    const raw = window.localStorage.getItem("bf_vid");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.value).toBe(id);
    expect(parsed.createdAt).toBe(now);
  });

  it("returns the same value on subsequent calls within TTL", () => {
    const a = getOrCreateVisitorId();
    const b = getOrCreateVisitorId();
    const c = getOrCreateVisitorId();
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("re-mints when createdAt is older than 2 years", () => {
    const old = 1_700_000_000_000;
    const a = getOrCreateVisitorId(old);
    // Advance time past TTL.
    const now = old + VISITOR_TTL_MS + 1000;
    const b = getOrCreateVisitorId(now);
    expect(b).not.toBe(a);
    expect(b).toMatch(UUID_V4_RE);
    const parsed = JSON.parse(window.localStorage.getItem("bf_vid")!);
    expect(parsed.value).toBe(b);
    expect(parsed.createdAt).toBe(now);
  });

  it("does NOT re-mint when createdAt is exactly at the TTL boundary", () => {
    const old = 1_700_000_000_000;
    const a = getOrCreateVisitorId(old);
    const exactlyTTL = old + VISITOR_TTL_MS;
    const b = getOrCreateVisitorId(exactlyTTL);
    expect(b).toBe(a);
  });

  it("re-mints when stored JSON is malformed", () => {
    window.localStorage.setItem("bf_vid", "not-json{");
    const id = getOrCreateVisitorId();
    expect(id).toMatch(UUID_V4_RE);
  });

  it("re-mints when stored value is not a UUID v4", () => {
    window.localStorage.setItem(
      "bf_vid",
      JSON.stringify({ value: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZB", createdAt: Date.now() }),
    );
    const id = getOrCreateVisitorId();
    expect(id).toMatch(UUID_V4_RE);
    expect(id).not.toBe("01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZB");
  });

  it("falls back to in-memory id when localStorage throws (private mode)", () => {
    const orig = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("private mode");
    };
    try {
      const a = getOrCreateVisitorId();
      const b = getOrCreateVisitorId();
      expect(a).toMatch(UUID_V4_RE);
      expect(b).toBe(a);
    } finally {
      window.localStorage.getItem = orig;
    }
  });

  it("survives across calls when in-memory cache is cleared (re-reads from localStorage)", () => {
    const a = getOrCreateVisitorId();
    _resetLoaderContextCacheForTests(); // clears in-memory only
    const b = getOrCreateVisitorId();
    expect(b).toBe(a);
  });
});

// ── Phase 3.6: landing_page (per-session, sessionStorage) ───────────

describe("getOrCreateLandingPage (Phase 3.6)", () => {
  it("captures the current sanitized URL on first call", () => {
    const url = "https://apelviken.rutgr.com/stays/svalan?utm_source=newsletter";
    const out = getOrCreateLandingPage(url);
    expect(out).toBe(url);
    expect(window.sessionStorage.getItem("bf_landing")).toBe(url);
  });

  it("returns the SAME landing on subsequent calls even if the URL changes", () => {
    const first = "https://apelviken.rutgr.com/?utm_source=x";
    const second = "https://apelviken.rutgr.com/stays/svalan";
    const a = getOrCreateLandingPage(first);
    const b = getOrCreateLandingPage(second);
    const c = getOrCreateLandingPage(second);
    expect(a).toBe(first);
    expect(b).toBe(first);
    expect(c).toBe(first);
  });

  it("falls back to in-memory when sessionStorage throws", () => {
    const origGet = window.sessionStorage.getItem;
    window.sessionStorage.getItem = () => {
      throw new Error("private mode");
    };
    try {
      const a = getOrCreateLandingPage("https://x.example/");
      const b = getOrCreateLandingPage("https://y.example/"); // ignored
      expect(a).toBe("https://x.example/");
      expect(b).toBe(a);
    } finally {
      window.sessionStorage.getItem = origGet;
    }
  });
});

// ── Phase 3.6: rotation interlock with session_id ───────────────────

describe("clearSessionId — also clears landing_page (Phase 3.6)", () => {
  it("removes bf_landing alongside bf_sid and bf_session_last_emit_at", () => {
    buildStorefrontContext();
    markSessionEmit(Date.now());
    expect(window.sessionStorage.getItem("bf_sid")).not.toBeNull();
    expect(window.sessionStorage.getItem("bf_landing")).not.toBeNull();
    expect(window.sessionStorage.getItem("bf_session_last_emit_at")).not.toBeNull();

    clearSessionId();

    expect(window.sessionStorage.getItem("bf_sid")).toBeNull();
    expect(window.sessionStorage.getItem("bf_landing")).toBeNull();
    expect(window.sessionStorage.getItem("bf_session_last_emit_at")).toBeNull();
  });

  it("after clearSessionId, the next buildStorefrontContext() captures a fresh landing_page", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://apelviken.rutgr.com/page-A"),
      configurable: true,
    });
    const a = buildStorefrontContext().landing_page;
    expect(a).toBe("https://apelviken.rutgr.com/page-A");

    Object.defineProperty(window, "location", {
      value: new URL("https://apelviken.rutgr.com/page-B"),
      configurable: true,
    });
    // Same session — landing remains pinned to page-A.
    expect(buildStorefrontContext().landing_page).toBe(a);

    clearSessionId();
    // After rotation, page-B becomes the new landing.
    const b = buildStorefrontContext().landing_page;
    expect(b).toBe("https://apelviken.rutgr.com/page-B");
    expect(b).not.toBe(a);
  });

  it("visitor_id is NOT cleared by clearSessionId (persists across session rotations)", () => {
    const a = buildStorefrontContext().visitor_id;
    clearSessionId();
    const b = buildStorefrontContext().visitor_id;
    expect(b).toBe(a);
  });
});

describe("buildStorefrontContext — wires Phase 3.6 fields", () => {
  it("includes visitor_id (UUID v4) and landing_page (current URL on first emit)", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://apelviken.rutgr.com/stays/svalan?utm_source=test"),
      configurable: true,
    });
    const ctx = buildStorefrontContext();
    expect(ctx.visitor_id).toMatch(UUID_V4_RE);
    expect(ctx.landing_page).toBe(
      "https://apelviken.rutgr.com/stays/svalan?utm_source=test",
    );
  });

  it("landing_page is sanitized (drops non-allowlisted query params and fragment)", () => {
    Object.defineProperty(window, "location", {
      value: new URL(
        "https://apelviken.rutgr.com/?email=foo&utm_source=newsletter#section-2",
      ),
      configurable: true,
    });
    const ctx = buildStorefrontContext();
    expect(ctx.landing_page).not.toContain("email=");
    expect(ctx.landing_page).not.toContain("#");
    expect(ctx.landing_page).toContain("utm_source=newsletter");
  });
});
