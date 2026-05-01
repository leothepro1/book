/**
 * Phase 3 PR-B — Analytics loader (main thread entry).
 *
 * Compiled by `scripts/build-analytics-runtime.mjs` to
 * `public/analytics/loader.<hash>.js`. Loaded as
 * `<script type="module" async>` by `AnalyticsLoader.tsx` at SSR
 * time; the same component inlines the runtime bundle's hashed URL,
 * the resolved tenantId, and the geo country code via a sibling
 * `<script>` block before this loader runs.
 *
 * Runs in parallel with the legacy `AnalyticsProvider` (server-side
 * `track()` to the v1 endpoint). Cutover plan: post-Phase 5 after
 * new pipeline aggregations validate against legacy data. Do NOT
 * remove `AnalyticsProvider` in this PR — duplicate emissions are
 * intentional during the parity window. See CLAUDE.md "Analytics
 * pipeline" section.
 *
 * Pipeline:
 *
 *   1. Read consent cookie + DNT flags + geo header. Decide:
 *        DNT (any geo)          → deny
 *        consent set → analytics:bool decides
 *        no consent + EEA       → prompt (banner — Commit G)
 *        no consent + non-EEA   → grant
 *   2. On grant, spawn the Web Worker (deferred — only on first
 *      qualifying track() call).
 *   3. Build StorefrontContext synchronously (UA hash precomputed
 *      at boot via Web Crypto SubtleCrypto).
 *   4. postMessage to worker: { type:'event', tenantId, eventName,
 *      payload, correlationId? }.
 *   5. Worker postMessages back: { type:'send', envelope } or
 *      { type:'error', code, ... }. We dispatch via fetch keepalive
 *      (sendBeacon-on-unload added in Commit H).
 *
 * Public API exposed on `window.bedfrontAnalytics`:
 *
 *   track(eventName, payload, opts?) — emit any storefront event
 *   pageView(opts?)                  — emit page_viewed (auto-classifies)
 */

import {
  buildStorefrontContext,
  precomputeUserAgentHash,
} from "./loader-context";
import type {
  RequestEnvelope,
  StorefrontEventName,
  WorkerInboundEventMessage,
  WorkerOutboundMessage,
} from "./worker-types";

// ── Inlined globals (set by AnalyticsLoader.tsx server component) ───

interface BedfrontRuntimeManifest {
  /** Hashed runtime bundle filename, e.g. "runtime.<hash>.js". */
  runtime: string;
  /** Hashed loader bundle filename, e.g. "loader.<hash>.js". Echoed
   *  back from the manifest for completeness; loader doesn't read it. */
  loader?: string | null;
  /** Server-resolved tenantId. Worker uses it for tenant-lock checks. */
  tenantId: string;
}

declare global {
  interface Window {
    __bedfront_geo?: string | null;
    __bedfront_runtime?: BedfrontRuntimeManifest;
    bedfrontAnalytics?: BedfrontAnalyticsAPI;
  }
}

interface BedfrontAnalyticsAPI {
  /** Emit a storefront event. Silently no-ops without consent or
   *  before the loader has finished bootstrapping. */
  track: (
    eventName: StorefrontEventName,
    payload: Record<string, unknown>,
    opts?: { correlationId?: string },
  ) => void;
  /** Emit page_viewed with auto-classified page_type, or
   *  caller-supplied page_type via opts. */
  pageView: (opts?: { page_type?: PageType }) => void;
}

type PageType =
  | "home"
  | "stay"
  | "checkout"
  | "account"
  | "support"
  | "policy"
  | "other";

interface ConsentCookie {
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

// ── Constants ───────────────────────────────────────────────────────

const DISPATCH_URL = "/api/analytics/collect";
const CONSENT_COOKIE = "bf_consent";
const ANALYTICS_BUNDLE_PATH = "/analytics/";

// EEA + EEA-equivalent jurisdictions. Conservative set — includes
// EU 27 + EEA non-EU (Iceland, Liechtenstein, Norway) + UK + CH
// (Swiss FADP and UK GDPR are GDPR-equivalent for analytics consent
// purposes). Errs on the side of "prompt for consent" — better to
// over-prompt than to silently track an EEA visitor.
const EEA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
  "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
  "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
]);

// ── State (closure-scoped — module evaluates once per page) ─────────

let worker: Worker | null = null;
let workerSpawnFailed = false;
let bootstrapped = false;

// ── Helpers ─────────────────────────────────────────────────────────

function reportToSentry(message: string, extra: unknown): void {
  try {
    const w = window as unknown as {
      Sentry?: {
        captureMessage?: (m: string, opts?: { extra?: unknown }) => void;
      };
    };
    const sentry = w.Sentry;
    if (sentry && typeof sentry.captureMessage === "function") {
      sentry.captureMessage(message, {
        extra: { error: String(extra), tag: "analytics.worker" },
      });
      return;
    }
  } catch {
    /* fall through to console */
  }
  // eslint-disable-next-line no-console
  console.warn(`[bedfront-analytics] ${message}`, extra);
}

function readConsent(): ConsentCookie | null {
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`),
  );
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]!)) as ConsentCookie;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.essential === true &&
      typeof parsed.analytics === "boolean" &&
      typeof parsed.marketing === "boolean"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function hasDoNotTrack(): boolean {
  // DNT is browser-fragmented:
  //   - Firefox keeps `navigator.doNotTrack` ("1" / "0" / "unspecified")
  //   - Legacy Chrome had `window.doNotTrack` (now removed)
  //   - Newer signal: `navigator.globalPrivacyControl` (true / false)
  // Treat any positive signal as DNT. Absence ≠ "off" — it just means
  // the browser doesn't expose the API.
  const navAny = navigator as unknown as {
    doNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  };
  const winAny = window as unknown as { doNotTrack?: string | null };
  if (navAny.doNotTrack === "1" || navAny.doNotTrack === "yes") return true;
  if (winAny.doNotTrack === "1") return true;
  if (navAny.globalPrivacyControl === true) return true;
  return false;
}

function geoCountry(): string | null {
  const v = window.__bedfront_geo;
  if (typeof v === "string" && v.length === 2) return v.toUpperCase();
  return null;
}

function isEEA(country: string | null): boolean {
  // Defensive default: null/unknown geo → assume EEA → require consent.
  if (country === null) return true;
  return EEA_COUNTRIES.has(country);
}

type ConsentDecision = "grant" | "deny" | "prompt";

function decideConsent(): ConsentDecision {
  if (hasDoNotTrack()) return "deny";
  const consent = readConsent();
  if (consent !== null) return consent.analytics === true ? "grant" : "deny";
  return isEEA(geoCountry()) ? "prompt" : "grant";
}

function classifyPage(): PageType {
  const p = window.location.pathname;
  if (p === "/" || p === "") return "home";
  if (p.startsWith("/stay") || p.startsWith("/stays")) return "stay";
  if (p.startsWith("/checkout") || p.startsWith("/cart")) return "checkout";
  if (p.startsWith("/account") || p.startsWith("/portal")) return "account";
  if (p.startsWith("/support") || p.startsWith("/help")) return "support";
  if (p.startsWith("/policy") || p.startsWith("/policies")) return "policy";
  return "other";
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (workerSpawnFailed) return null;
  const manifest = window.__bedfront_runtime;
  if (!manifest?.runtime) {
    workerSpawnFailed = true;
    reportToSentry("worker manifest missing", { manifest });
    return null;
  }
  try {
    const url = ANALYTICS_BUNDLE_PATH + manifest.runtime;
    worker = new Worker(url, { type: "module" });
    worker.addEventListener("message", onWorkerMessage);
    worker.addEventListener("error", (e) => {
      reportToSentry("worker error event", {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
      });
    });
    return worker;
  } catch (err) {
    workerSpawnFailed = true;
    reportToSentry("worker spawn failed", err);
    return null;
  }
}

function onWorkerMessage(e: MessageEvent<WorkerOutboundMessage>): void {
  const msg = e.data;
  if (msg.type === "send") {
    dispatchEnvelope(msg.envelope);
    return;
  }
  // type === "error" — log and drop. Worker errors are non-fatal at
  // the page-script level: we never want to crash the storefront for
  // an analytics issue.
  reportToSentry(`analytics worker error: ${msg.code}`, {
    code: msg.code,
    message: msg.message,
    details: msg.details,
    correlationId: msg.correlationId,
  });
}

function dispatchEnvelope(envelope: RequestEnvelope): void {
  // fetch keepalive: works through pagehide/unload, doesn't block UI.
  // Commit H adds the unload-time sendBeacon path for higher delivery
  // reliability on tab close.
  try {
    fetch(DISPATCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      credentials: "include",
      keepalive: true,
    }).catch((err) => reportToSentry("dispatch fetch rejected", err));
  } catch (err) {
    reportToSentry("dispatch threw synchronously", err);
  }
}

// ── Public-API implementations ──────────────────────────────────────

function track(
  eventName: StorefrontEventName,
  payload: Record<string, unknown>,
  opts?: { correlationId?: string },
): void {
  if (!bootstrapped) return; // still resolving UA hash
  const decision = decideConsent();
  if (decision !== "grant") {
    // "deny" and "prompt" both no-op the dispatch path. The consent
    // banner (Commit G) handles "prompt" by mounting UI and on
    // accept/decline writes the cookie + retries by re-running
    // bootstrap. Until G lands, "prompt" is functionally "deny".
    return;
  }
  const manifest = window.__bedfront_runtime;
  if (!manifest?.tenantId) {
    reportToSentry("track called without tenantId in manifest", { eventName });
    return;
  }
  const w = ensureWorker();
  if (!w) return;

  const ctx = buildStorefrontContext();
  const message: WorkerInboundEventMessage = {
    type: "event",
    tenantId: manifest.tenantId,
    eventName,
    payload: { ...ctx, ...payload },
    ...(opts?.correlationId ? { correlationId: opts.correlationId } : {}),
  };
  try {
    w.postMessage(message);
  } catch (err) {
    reportToSentry("worker postMessage threw", err);
  }
}

function pageView(opts?: { page_type?: PageType }): void {
  track("page_viewed", { page_type: opts?.page_type ?? classifyPage() });
}

// ── Bootstrap ───────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Precompute UA hash so the very first event has the real value.
  // Slice the UA at 200 chars — full strings can be megabytes-long
  // in some browsers/extensions, and we don't want to hash that.
  try {
    await precomputeUserAgentHash(
      (navigator.userAgent ?? "unknown").slice(0, 200),
    );
  } catch (err) {
    reportToSentry("precomputeUserAgentHash failed", err);
  }

  bootstrapped = true;

  // Expose the public API once we can produce real envelopes.
  window.bedfrontAnalytics = { track, pageView };

  // Auto page_view: fire once now, then again on each SPA navigation
  // (popstate + a custom event Next.js emits). The dispatch path is
  // idempotent at the outbox level (UNIQUE (tenant_id, event_id))
  // so duplicate fires from rapid navigations are deduped server-side.
  pageView();
  window.addEventListener("popstate", () => pageView());
  // Next.js doesn't emit a built-in route-change event in App Router.
  // Phase 3.x will wire a router-events bridge component. For now,
  // popstate covers back/forward; explicit `bedfrontAnalytics.pageView()`
  // calls cover programmatic navigations from the host page.
}

// Module IIFE — top-level await is allowed in ES modules and works
// in Worker-bundle and main-thread bundle alike. We void the promise
// rather than awaiting at the top level so a failure in bootstrap
// can't block module evaluation forever.
void bootstrap();
