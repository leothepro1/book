/**
 * Phase 3 PR-B — Storefront context builder (main thread).
 *
 * Worker has no DOM access — all browser-derived context fields
 * (page URL, referrer, viewport, locale, session id, UA hash) are
 * built here and passed to the worker as part of every event
 * payload. Validates against StorefrontContextSchema in the worker.
 *
 * `user_agent_hash` is sha256(navigator.userAgent).slice(0, 16) hex.
 * The raw UA string never enters the analytics pipeline — Phase 5
 * uses the hash only as a stability key (same browser = same hash).
 *
 * `session_id` is a client-generated ULID stored in sessionStorage
 * for the duration of the browser tab session. Sessions don't share
 * across tabs (matches industry norm — each tab is its own
 * tracking-session). Falls back to an in-memory cache when
 * sessionStorage is unavailable (private browsing on some browsers).
 */

import { ulid } from "ulidx";

const SESSION_KEY = "bf_sid";
const SESSION_LAST_EMIT_KEY = "bf_session_last_emit_at";
const SESSION_PRIOR_DECISION_KEY = "bf_session_prior_consent_decision";
const UA_HASH_LEN = 16; // 16 hex chars from sha256

/**
 * `session_id` rotates after this many ms of cart-emit idle. 30
 * minutes per the schema's Semantic Contract for storefront-context
 * `session_id`.
 */
const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * Allowed query parameters on `page_url`. Everything else (including
 * `?email=`, `?token=`, custom-tracking params not in this list) is
 * stripped before emit. The URL fragment (`#hash`) is always stripped.
 *
 * Adding a new permitted parameter requires a v0.2.0 schema bump on
 * `_storefront-context.page_url` per the Semantic Contract.
 *
 * Order doesn't matter — Set membership is the only check.
 */
const PAGE_URL_QUERY_ALLOWLIST = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);

let cachedUaHash: string | null = null;
let inMemorySessionId: string | null = null;

/**
 * Compute the user-agent hash once at bootstrap. Subsequent
 * `buildStorefrontContext()` calls return synchronously using the
 * cached value. Call before exposing the public `bedfrontAnalytics`
 * API so the first event already has the real hash.
 *
 * The hash input is constructed as `tenantSalt + ":" + ua`, where
 * `tenantSalt` is read from `window.__bedfront_analytics_salt` (set
 * by the SSR-side AnalyticsLoader component). The salt provides
 * per-tenant namespace isolation — the same browser visiting two
 * tenants produces unrelated hashes.
 *
 * Phase 1 fallback: when the salt is absent or empty (pre-backfill
 * tenant or boot-time race), the hash is computed UNSALTED — input
 * is just the UA. Caller-supplied `onMissingSalt` lets the loader
 * report the absence to Sentry; the hash itself still produces a
 * structurally-valid 16-char hex string so the storefront keeps
 * tracking.
 */
export async function precomputeUserAgentHash(
  ua: string,
  onMissingSalt?: () => void,
): Promise<string> {
  if (cachedUaHash) return cachedUaHash;
  const salt = readAnalyticsSalt();
  if (!salt) onMissingSalt?.();
  const input = salt ? `${salt}:${ua}` : ua;
  cachedUaHash = await sha256Hex(input);
  return cachedUaHash;
}

/**
 * Read `window.__bedfront_analytics_salt` defensively. Empty string
 * is treated identically to absence — both cases trigger the
 * unsalted-fallback path and the caller's `onMissingSalt` hook.
 */
function readAnalyticsSalt(): string {
  const w = window as unknown as { __bedfront_analytics_salt?: unknown };
  const v = w.__bedfront_analytics_salt;
  if (typeof v !== "string") return "";
  return v;
}

/**
 * Test-only — clears the module-level UA hash cache so a fresh
 * `precomputeUserAgentHash()` runs on the next call. Also resets
 * the in-memory session-id fallback so private-mode tests start
 * clean. Does NOT touch sessionStorage — tests that need that
 * cleared call `window.sessionStorage.clear()` in their `beforeEach`
 * (the existing pattern). Production code never invokes this.
 */
export function _resetLoaderContextCacheForTests(): void {
  cachedUaHash = null;
  inMemorySessionId = null;
}

export interface StorefrontContext {
  page_url: string;
  page_referrer: string;
  user_agent_hash: string;
  viewport: { width: number; height: number };
  locale: string;
  session_id: string;
}

export interface BuildContextOptions {
  /**
   * Override `document.documentElement.lang`. Useful when the host
   * page hasn't set lang yet but the loader knows the locale via
   * URL or cookie.
   */
  localeOverride?: string;
}

/**
 * Synchronous builder. Assumes `precomputeUserAgentHash()` has
 * already resolved — if not, returns the placeholder "ua_pending"
 * so the schema's `user_agent_hash: z.string().min(1)` still
 * passes. The placeholder is observable in Phase 5 dashboards as a
 * "loader race" signal worth fixing if it ever appears in
 * production.
 */
export function buildStorefrontContext(
  opts: BuildContextOptions = {},
): StorefrontContext {
  return {
    // page_url is sanitized — query string filtered against an
    // allowlist, fragment stripped. page_referrer is intentionally
    // NOT sanitized (the schema's contract assigns referrer
    // sanitization to Phase 5 readers).
    page_url: sanitizePageUrl(window.location.href),
    page_referrer: document.referrer,
    user_agent_hash: cachedUaHash ?? "ua_pending",
    viewport: {
      width: Math.max(0, Math.floor(window.innerWidth || 0)),
      height: Math.max(0, Math.floor(window.innerHeight || 0)),
    },
    locale:
      opts.localeOverride ??
      readDocLang() ??
      readNavigatorLanguage() ??
      "sv",
    session_id: getOrCreateSessionId(),
  };
}

/**
 * Sanitize a page URL for emit:
 *
 *   1. Drop every query parameter whose name is not in
 *      `PAGE_URL_QUERY_ALLOWLIST` (utm_*, fbclid, gclid).
 *   2. Drop the URL fragment (`#hash`).
 *
 * Phase 5 readers MAY treat the resulting `page_url` as PII-clean
 * once this function is in place — see `_storefront-context.ts`
 * Semantic Contract.
 *
 * Malformed URLs (anything that throws in `new URL(...)`) are passed
 * through unchanged. The schema's structural constraint is
 * `z.string().min(1)`, which preserved-as-is satisfies. Crashing the
 * emit path on a weird location.href would be a worse failure mode —
 * we'd lose the event entirely. Sanitization is best-effort.
 */
export function sanitizePageUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const filtered = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (PAGE_URL_QUERY_ALLOWLIST.has(key)) filtered.set(key, value);
  }
  url.search = filtered.toString();
  url.hash = "";
  return url.toString();
}

function readDocLang(): string | null {
  const lang = document.documentElement.lang;
  if (typeof lang === "string" && lang.length >= 2) return lang;
  return null;
}

function readNavigatorLanguage(): string | null {
  const lang = navigator.language;
  if (typeof lang === "string" && lang.length >= 2) return lang;
  return null;
}

function getOrCreateSessionId(): string {
  // Try sessionStorage first. Catches private-browsing throws.
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored && stored.length >= 1) return stored;
    const fresh = ulid();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    if (inMemorySessionId) return inMemorySessionId;
    inMemorySessionId = ulid();
    return inMemorySessionId;
  }
}

// ── session_id rotation ────────────────────────────────────────────
//
// Three triggers per the schema contract:
//
//   1. 30-min idle since last emit  — checked on every emit (this
//      module).
//   2. Consent revoke + regrant     — clearSessionId() is called by
//      writeConsentCookie when the new choice is `analytics: false`
//      (single-source path), AND by maybeRotateOnConsentChange()
//      from the emit path (defense-in-depth detector that catches
//      paths bypassing writeConsentCookie — future Settings UI,
//      DevTools, etc.).
//   3. Tab close + reopen           — automatic via sessionStorage
//      semantics; no code needed.
//
// Detection happens in the emit path rather than via setInterval —
// timers are unreliable across bfcache and tab freezing.

/**
 * Test if the current session is idle past the 30-min threshold.
 * Pure read — does not rotate. Caller is responsible for rotating
 * via `clearSessionId()` when this returns true.
 */
export function isSessionIdle(now: number = Date.now()): boolean {
  try {
    const last = window.sessionStorage.getItem(SESSION_LAST_EMIT_KEY);
    if (!last) return false;
    const lastMs = parseInt(last, 10);
    if (!Number.isFinite(lastMs)) return false;
    return now - lastMs > SESSION_IDLE_MS;
  } catch {
    return false;
  }
}

/**
 * Stamp the current emit time. Caller invokes after a successful
 * emit so the next emit's idle check has a fresh baseline.
 */
export function markSessionEmit(now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(SESSION_LAST_EMIT_KEY, String(now));
  } catch {
    /* private mode — best effort */
  }
}

/**
 * Drop the current `session_id` from storage. The next call to
 * `getOrCreateSessionId()` (i.e. the next `buildStorefrontContext()`)
 * will mint a fresh ULID. Also clears the in-memory fallback so
 * private-browsing tabs rotate too.
 *
 * Use after detecting an idle timeout, on consent revoke (via
 * `writeConsentCookie`), or on a deny→grant transition observed in
 * the emit path.
 */
export function clearSessionId(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_LAST_EMIT_KEY);
  } catch {
    /* private mode — best effort */
  }
  inMemorySessionId = null;
}

/**
 * Read/write the prior consent decision tracked across emits.
 * Returns `null` for "no prior decision recorded" (first emit, or
 * sessionStorage cleared). The emit-path detector compares prior →
 * current to spot deny→grant transitions.
 */
export function readPriorConsentDecision(): "grant" | "deny" | null {
  try {
    const v = window.sessionStorage.getItem(SESSION_PRIOR_DECISION_KEY);
    if (v === "grant" || v === "deny") return v;
    return null;
  } catch {
    return null;
  }
}

export function writePriorConsentDecision(d: "grant" | "deny"): void {
  try {
    window.sessionStorage.setItem(SESSION_PRIOR_DECISION_KEY, d);
  } catch {
    /* private mode — best effort */
  }
}

async function sha256Hex(input: string): Promise<string> {
  // Web Crypto SubtleCrypto. Not available in insecure contexts
  // (http://) but Phase 3 only ships on https://<slug>.<base>; the
  // loader bundle never executes on insecure origins. If subtle is
  // somehow unavailable we degrade to a deterministic placeholder
  // rather than throwing.
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "ua_no_subtle";
  }
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < UA_HASH_LEN / 2; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
