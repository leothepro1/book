/**
 * Phase 3 PR-B + Phase 3.6 — Storefront context builder (main thread).
 *
 * Worker has no DOM access — all browser-derived context fields
 * (page URL, referrer, viewport, locale, session_id, UA hash,
 * visitor_id, landing_page) are built here and passed to the worker
 * as part of every event payload. Validates against
 * StorefrontContextSchema in the worker.
 *
 * `user_agent_hash` is sha256(navigator.userAgent).slice(0, 16) hex.
 * The raw UA string never enters the analytics pipeline — Phase 5
 * uses the hash only as a stability key (same browser = same hash).
 *
 * `session_id` (Phase 3 PR-B) is a client-generated ULID stored in
 * sessionStorage for the duration of the browser tab session.
 * Sessions don't share across tabs. Falls back to an in-memory cache
 * when sessionStorage is unavailable (private browsing).
 *
 * `visitor_id` (Phase 3.6) is a UUID v4 stored in localStorage with
 * a 2-year TTL enforced at read time. Survives session and tab
 * lifecycle; the stable identity that lets Phase 5 stitch returning
 * visitors. Format = UUID v4 (NOT ULID) so the persistent cookie
 * doesn't leak first-visit timestamps.
 *
 * `landing_page` (Phase 3.6) is the first sanitized URL of a
 * session, captured once and pinned in sessionStorage["bf_landing"].
 * Rotates together with session_id via clearSessionId(). Required by
 * Shopify-style last-non-direct-click attribution to identify the
 * page that started a session.
 */

import { ulid } from "ulidx";

const SESSION_KEY = "bf_sid";
const SESSION_LAST_EMIT_KEY = "bf_session_last_emit_at";
const SESSION_PRIOR_DECISION_KEY = "bf_session_prior_consent_decision";
const VISITOR_KEY = "bf_vid";
const LANDING_KEY = "bf_landing";
const UA_HASH_LEN = 16; // 16 hex chars from sha256

/**
 * `session_id` rotates after this many ms of cart-emit idle. 30
 * minutes per the schema's Semantic Contract for storefront-context
 * `session_id`.
 */
const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * `visitor_id` re-mints after this many ms. Two years per the schema
 * Semantic Contract — long enough to stitch returning visitors across
 * a year of seasonality, short enough that abandoned browsers
 * eventually cycle their identity. localStorage has no native TTL so
 * this is enforced in JS at read time via `createdAt`.
 */
const VISITOR_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;

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
let inMemoryVisitorId: string | null = null;
let inMemoryLandingPage: string | null = null;

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
 * the in-memory session-id, visitor-id, and landing-page fallbacks so
 * private-mode tests start clean. Does NOT touch sessionStorage or
 * localStorage — tests that need those cleared call
 * `window.sessionStorage.clear()` / `window.localStorage.clear()` in
 * their `beforeEach` (the existing pattern). Production code never
 * invokes this.
 */
export function _resetLoaderContextCacheForTests(): void {
  cachedUaHash = null;
  inMemorySessionId = null;
  inMemoryVisitorId = null;
  inMemoryLandingPage = null;
}

export interface StorefrontContext {
  page_url: string;
  page_referrer: string;
  user_agent_hash: string;
  viewport: { width: number; height: number };
  locale: string;
  session_id: string;
  visitor_id: string;
  landing_page: string;
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
  // page_url uses the freshly-sanitized current URL on every emit;
  // landing_page resolves the SAME sanitizer once per session and
  // pins the result so subsequent navigations don't overwrite it.
  const pageUrl = sanitizePageUrl(window.location.href);
  return {
    // page_url is sanitized — query string filtered against an
    // allowlist, fragment stripped. page_referrer is intentionally
    // NOT sanitized (the schema's contract assigns referrer
    // sanitization to Phase 5 readers).
    page_url: pageUrl,
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
    visitor_id: getOrCreateVisitorId(),
    landing_page: getOrCreateLandingPage(pageUrl),
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

// ── visitor_id (Phase 3.6) ──────────────────────────────────────────
//
// UUID v4 in localStorage["bf_vid"] as `{ value, createdAt }`. 2-year
// TTL enforced at read time (localStorage has no native expiry).
//
// Format = UUID v4 — NOT ULID. ULID's first 48 bits are a millisecond
// timestamp, and a persistent 2-year cookie shouldn't leak first-visit
// time to anyone with read access to localStorage. UUID v4 is uniformly
// random.
//
// Storage shape is JSON `{ "value": "<uuid>", "createdAt": <epoch ms> }`.
// Plain string would have worked, but storing createdAt explicitly lets
// us enforce the TTL without a second key — and gracefully re-mints
// when the JSON is malformed (storage quota corruption, manual edit).

interface VisitorEnvelope {
  value: string;
  createdAt: number;
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidVisitorEnvelope(v: unknown): v is VisitorEnvelope {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.value === "string" &&
    UUID_V4_RE.test(o.value) &&
    typeof o.createdAt === "number" &&
    Number.isFinite(o.createdAt)
  );
}

function mintVisitorUuid(): string {
  // crypto.randomUUID is a Web Crypto API — same module already uses
  // crypto.subtle for the UA hash. No polyfill needed.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Defensive: if the runtime lacks randomUUID (very old browsers,
  // insecure contexts), fall through to a Math.random-based v4. This
  // path is never expected to execute in production — the loader only
  // ships on https — but we'd rather emit a structurally-valid id than
  // crash the emit.
  const rand = (n: number) =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, "0");
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16); // 8|9|a|b
  return `${rand(8)}-${rand(4)}-4${rand(3)}-${variant}${rand(3)}-${rand(12)}`;
}

export function getOrCreateVisitorId(now: number = Date.now()): string {
  try {
    const raw = window.localStorage.getItem(VISITOR_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          isValidVisitorEnvelope(parsed) &&
          now - parsed.createdAt <= VISITOR_TTL_MS
        ) {
          return parsed.value;
        }
      } catch {
        /* malformed JSON — fall through to mint a fresh value */
      }
    }
    const fresh = mintVisitorUuid();
    const env: VisitorEnvelope = { value: fresh, createdAt: now };
    window.localStorage.setItem(VISITOR_KEY, JSON.stringify(env));
    return fresh;
  } catch {
    if (inMemoryVisitorId) return inMemoryVisitorId;
    inMemoryVisitorId = mintVisitorUuid();
    return inMemoryVisitorId;
  }
}

// ── landing_page (Phase 3.6) ────────────────────────────────────────
//
// Sanitized URL captured ONCE per session and pinned in
// sessionStorage["bf_landing"]. Rotates together with session_id via
// `clearSessionId()`. Caller passes in the already-sanitized current
// URL to avoid re-running the URL sanitizer twice in one emit.

export function getOrCreateLandingPage(currentSanitizedUrl: string): string {
  try {
    const stored = window.sessionStorage.getItem(LANDING_KEY);
    if (stored && stored.length >= 1) return stored;
    window.sessionStorage.setItem(LANDING_KEY, currentSanitizedUrl);
    return currentSanitizedUrl;
  } catch {
    if (inMemoryLandingPage) return inMemoryLandingPage;
    inMemoryLandingPage = currentSanitizedUrl;
    return inMemoryLandingPage;
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
    window.sessionStorage.removeItem(LANDING_KEY);
  } catch {
    /* private mode — best effort */
  }
  inMemorySessionId = null;
  inMemoryLandingPage = null;
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
