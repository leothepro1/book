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
const UA_HASH_LEN = 16; // 16 hex chars from sha256

let cachedUaHash: string | null = null;
let inMemorySessionId: string | null = null;

/**
 * Compute the user-agent hash once at bootstrap. Subsequent
 * `buildStorefrontContext()` calls return synchronously using the
 * cached value. Call before exposing the public `bedfrontAnalytics`
 * API so the first event already has the real hash.
 */
export async function precomputeUserAgentHash(ua: string): Promise<string> {
  if (cachedUaHash) return cachedUaHash;
  cachedUaHash = await sha256Hex(ua);
  return cachedUaHash;
}

/**
 * Test-only — clears the module-level UA hash cache so a fresh
 * `precomputeUserAgentHash()` runs on the next call. Production
 * code never invokes this.
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
    page_url: window.location.href,
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
