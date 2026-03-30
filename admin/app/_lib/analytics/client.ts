"use client";

/**
 * Analytics Client — Browser-side event tracking
 * ═══════════════════════════════════════════════
 *
 * Manages _bf_vid (visitor cookie, 2yr) and _bf_sid (session storage, 30min/midnight).
 * Sends events via sendBeacon — best-effort, never blocks UI.
 *
 * Commerce events (ORDER_CREATED, ORDER_PAID etc.) are NEVER emitted from here.
 * Those are server-side only.
 *
 * tenantId is NOT sent to the API — the server resolves it from the Host header.
 */

import { v4 as uuidv4 } from "uuid";

// Keys
const VISITOR_COOKIE = "_bf_vid";
const SESSION_KEY = "_bf_sid";
const SESSION_START_KEY = "_bf_sid_start";
const SESSION_LAST_ACTIVITY = "_bf_sid_last";
const UTM_KEY = "_bf_utm";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── Types ────────────────────────────────────────────────────

type AnalyticsEvent = {
  sessionId: string;
  visitorId: string;
  eventType: string;
  occurredAt: string;
  page?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  payload?: Record<string, unknown> | null;
};

// ── Visitor ID (persistent cookie, 2yr) ──────────────────────

function getOrCreateVisitorId(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]*)`));
  if (match) return decodeURIComponent(match[1]);

  const vid = uuidv4();
  const maxAge = 2 * 365 * 24 * 60 * 60;
  document.cookie = `${VISITOR_COOKIE}=${encodeURIComponent(vid)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  return vid;
}

// ── Session ID (sessionStorage, 30min/midnight) ──────────────

function isSessionExpired(): boolean {
  const lastActivity = sessionStorage.getItem(SESSION_LAST_ACTIVITY);
  if (!lastActivity) return true;

  const lastMs = parseInt(lastActivity, 10);
  const now = Date.now();

  if (now - lastMs > SESSION_TIMEOUT_MS) return true;

  const lastDate = new Date(lastMs).toISOString().slice(0, 10);
  const todayDate = new Date(now).toISOString().slice(0, 10);
  if (lastDate !== todayDate) return true;

  return false;
}

function getOrCreateSessionId(): { sessionId: string; isNew: boolean } {
  const existing = sessionStorage.getItem(SESSION_KEY);

  if (existing && !isSessionExpired()) {
    sessionStorage.setItem(SESSION_LAST_ACTIVITY, Date.now().toString());
    return { sessionId: existing, isNew: false };
  }

  const sid = uuidv4();
  sessionStorage.setItem(SESSION_KEY, sid);
  sessionStorage.setItem(SESSION_START_KEY, Date.now().toString());
  sessionStorage.setItem(SESSION_LAST_ACTIVITY, Date.now().toString());
  return { sessionId: sid, isNew: true };
}

function updateLastActivity(): void {
  sessionStorage.setItem(SESSION_LAST_ACTIVITY, Date.now().toString());
}

// ── Activity listeners — extend session on scroll/click/key ──

let activityListenersAttached = false;
let lastActivityUpdate = 0;
const ACTIVITY_THROTTLE_MS = 30_000;

function setupActivityListeners(): void {
  if (activityListenersAttached) return;
  activityListenersAttached = true;

  const onActivity = () => {
    const now = Date.now();
    if (now - lastActivityUpdate < ACTIVITY_THROTTLE_MS) return;
    lastActivityUpdate = now;
    updateLastActivity();
  };

  window.addEventListener("scroll", onActivity, { passive: true });
  window.addEventListener("click", onActivity, { passive: true });
  window.addEventListener("keydown", onActivity, { passive: true });
  window.addEventListener("mousemove", onActivity, { passive: true });
}

// ── UTM capture ──────────────────────────────────────────────

type UtmParams = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

function captureUtmParams(): UtmParams {
  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
  };

  if (utm.utmSource) {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  }

  const stored = sessionStorage.getItem(UTM_KEY);
  if (stored && !utm.utmSource) {
    return JSON.parse(stored);
  }

  return utm;
}

// ── Event queue + sendBeacon ─────────────────────────────────

const eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushQueue(): void {
  if (eventQueue.length === 0) return;

  const batch = eventQueue.splice(0, 10);
  const payload = JSON.stringify({ events: batch });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/events", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/api/analytics/events", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }

  if (eventQueue.length > 0) {
    flushTimer = setTimeout(() => flushQueue(), 100);
  }
}

function queueEvent(event: AnalyticsEvent): void {
  eventQueue.push(event);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flushQueue(), 200);
}

// ── Public API ───────────────────────────────────────────────

export type TrackOptions = {
  tenantId: string;
  eventType: string;
  payload?: Record<string, unknown> | null;
};

/**
 * track — emit an analytics event from the frontend.
 *
 * tenantId is kept in the signature for caller context but is NOT
 * sent to the API — the server resolves it from the Host header.
 *
 * Never call this for commerce events (ORDER_CREATED, ORDER_PAID etc.)
 */
export function track(options: TrackOptions): void {
  if (typeof window === "undefined") return;

  setupActivityListeners();

  const { eventType, payload } = options;
  const visitorId = getOrCreateVisitorId();
  const { sessionId, isNew } = getOrCreateSessionId();
  const utm = captureUtmParams();

  updateLastActivity();

  if (isNew && eventType !== "SESSION_STARTED") {
    queueEvent({
      sessionId,
      visitorId,
      eventType: "SESSION_STARTED",
      occurredAt: new Date().toISOString(),
      page: window.location.pathname,
      referrer: document.referrer || null,
      ...utm,
      payload: { landingPage: window.location.pathname },
    });
  }

  queueEvent({
    sessionId,
    visitorId,
    eventType,
    occurredAt: new Date().toISOString(),
    page: window.location.pathname,
    referrer: document.referrer || null,
    ...utm,
    payload: payload ?? null,
  });
}

/**
 * trackSessionEnd — call on page unload. Uses sendBeacon directly.
 * tenantId kept in signature for caller compatibility but not sent to API.
 */
export function trackSessionEnd(_tenantId: string): void {
  if (typeof window === "undefined") return;

  const sessionId = sessionStorage.getItem(SESSION_KEY);
  const visitorId = getOrCreateVisitorId();
  const sessionStart = sessionStorage.getItem(SESSION_START_KEY);

  if (!sessionId) return;

  const durationSeconds = sessionStart
    ? Math.round((Date.now() - parseInt(sessionStart, 10)) / 1000)
    : 0;

  const payload = JSON.stringify({
    events: [{
      sessionId,
      visitorId,
      eventType: "SESSION_ENDED",
      occurredAt: new Date().toISOString(),
      page: window.location.pathname,
      payload: { durationSeconds },
    }],
  });

  navigator.sendBeacon?.("/api/analytics/events", new Blob([payload], { type: "application/json" }));
}
