/**
 * Phase 3 dispatch endpoint — POST /api/analytics/collect
 * ════════════════════════════════════════════════════════
 *
 * Receives storefront-emitted analytics events from the web pixel
 * runtime (Phase 3 PR-B) and routes them through the same
 * outbox-emitter that server-side mutations use. This is the SOLE
 * public ingress for browser-emitted events; nothing else from the
 * client side touches the analytics pipeline.
 *
 * Pipeline contract (mirrors server-side emitters from Phase 1/2):
 *
 *   Worker (PR-B)
 *     │  POST /api/analytics/collect
 *     ▼
 *   This route
 *     1. Resolve tenant from Host header (NEVER from body)
 *     2. Origin / Host check (Q7: <slug>.bedfront.com format)
 *     3. Rate limit (Q6: 429 + Retry-After on excess)
 *     4. Parse body (tolerant of beacon's `text/plain`)
 *     5. Validate envelope shape; refuse non-storefront event_name
 *     6. Read consent cookie, parse, gate by `isEventConsented`
 *     7. Pipeline feature flag check (per-tenant kill-switch)
 *     8. emitAnalyticsEventStandalone — registry validates payload,
 *        outbox row stamped with worker-supplied event_id
 *     9. (no signal flush — drainer cron picks up within 60s; we
 *        keep the dispatch path latency-bounded and don't block on
 *        Inngest reachability)
 *
 * Beacon tolerance: `navigator.sendBeacon()` cannot set
 * `Content-Type: application/json` without a CORS preflight, so the
 * worker sends as `text/plain` with a JSON-stringified body. We
 * accept either content-type and JSON.parse the body manually.
 *
 * Response shape: 204 No Content on accept (silent — workers don't
 * care about response bodies), 400 on bad envelope, 401 origin
 * mismatch, 403 consent declined / pipeline disabled, 404 unknown
 * tenant, 429 rate-limited (with Retry-After), 422 schema
 * validation, 500 emitter failure.
 *
 * Status code rationale:
 *   - 204 (not 200) so the body is empty by spec — beacons discard
 *     bodies anyway, and saving the bytes matters at scale.
 *   - 403 for consent (not 401): the request is well-formed and
 *     authenticated by origin; the visitor has explicitly declined
 *     this category. "Forbidden by visitor preference" is the
 *     accurate semantic.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import {
  ConsentCategoriesSchema,
  STOREFRONT_EVENT_CATEGORIES,
  isEventConsented,
} from "@/app/_lib/analytics/pipeline/consent";
import { emitAnalyticsEventStandalone } from "@/app/_lib/analytics/pipeline/emitter";
import { isAnalyticsEnabledForTenant } from "@/app/_lib/analytics/pipeline/feature-flag";
import { checkAnalyticsOrigin } from "@/app/_lib/analytics/pipeline/origin-check";
import { checkAnalyticsRateLimit } from "@/app/_lib/analytics/pipeline/rate-limit";
import { AnalyticsValidationError } from "@/app/_lib/analytics/pipeline/errors";
import {
  type RegisteredEventName,
  AnalyticsSchemaNotRegisteredError,
  AnalyticsSchemaVersionMissingError,
} from "@/app/_lib/analytics/pipeline/schemas/registry";
import { log } from "@/app/_lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Envelope schema ──────────────────────────────────────────────────────

const STOREFRONT_EVENT_NAMES = Object.keys(STOREFRONT_EVENT_CATEGORIES) as [
  string,
  ...string[],
];

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const RequestEnvelopeSchema = z.object({
  event_id: z.string().regex(ULID_REGEX, "event_id must be a 26-char Crockford Base32 ULID"),
  event_name: z.enum(STOREFRONT_EVENT_NAMES),
  schema_version: z.string().regex(/^\d+\.\d+\.\d+$/, "schema_version must be semver"),
  occurred_at: z.string().datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()),
  // The cookie is the authoritative consent source. We accept an
  // explicit `consent` field in the body too, but the worker never
  // sends one — it's a hook for future server-rendered tracking
  // pixels that don't carry cookies. When both are present the
  // cookie wins.
  consent: ConsentCategoriesSchema.optional(),
  // Optional correlation id for joining cross-event causality (e.g.
  // a cart_started → cart_updated → checkout_started chain). Worker
  // generates per-cart.
  correlation_id: z.string().min(1).max(64).optional(),
});

const CONSENT_COOKIE = "bf_consent";

// ── Helpers ──────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function parseBody(req: Request): Promise<unknown> {
  // Beacons land as `text/plain`. Application/json is the default
  // for fetch keepalive. Accept both; reject everything else so a
  // misconfigured caller doesn't hide a JSON parse error behind a
  // 500.
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json") && !contentType.startsWith("text/plain")) {
    throw new BadEnvelope("unsupported_content_type", `unsupported content-type: ${contentType}`);
  }
  const raw = await req.text();
  if (!raw) throw new BadEnvelope("empty_body", "request body was empty");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BadEnvelope("invalid_json", "request body was not valid JSON");
  }
}

class BadEnvelope extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

function readConsentCookie(req: Request): unknown {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== CONSENT_COOKIE) continue;
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null; // malformed cookie → treat as no consent
    }
  }
  return null;
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Same-origin gate (cheap, no DB; runs before rate limit so we
  //    don't burn a tenant bucket on bogus origin traffic).
  const originResult = checkAnalyticsOrigin({
    host: req.headers.get("host"),
    origin: req.headers.get("origin"),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
  if (!originResult.ok) {
    log("warn", "analytics.collect.origin_rejected", { reason: originResult.reason });
    return new NextResponse(null, { status: 401 });
  }

  // 2. Tenant resolution from Host header. NEVER from body — a
  //    client-supplied tenant_id is a tenancy-bypass attack.
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    log("warn", "analytics.collect.tenant_not_found", {
      host: req.headers.get("host"),
    });
    return new NextResponse(null, { status: 404 });
  }
  const tenantId = tenant.id;

  // 3. Rate limit (per-IP and per-tenant). Q6: 429 + Retry-After.
  const ip = getClientIp(req);
  const rl = await checkAnalyticsRateLimit(tenantId, ip);
  if (!rl.allowed) {
    log("warn", "analytics.collect.rate_limited", {
      tenantId,
      scope: rl.scope,
      retryAfterSeconds: rl.retryAfterSeconds,
    });
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  // 4. Body parse (tolerant of beacon text/plain).
  let parsedBody: unknown;
  try {
    parsedBody = await parseBody(req);
  } catch (err) {
    if (err instanceof BadEnvelope) {
      log("warn", "analytics.collect.bad_envelope", {
        tenantId,
        reason: err.reason,
      });
      return new NextResponse(null, { status: 400 });
    }
    throw err;
  }

  // 5. Envelope validation. event_name is restricted to the storefront
  //    set BEFORE the registry is consulted — server-only events must
  //    never be dispatchable from the browser.
  const envelopeResult = RequestEnvelopeSchema.safeParse(parsedBody);
  if (!envelopeResult.success) {
    log("warn", "analytics.collect.envelope_invalid", {
      tenantId,
      issues: envelopeResult.error.issues.map((i) => i.path.join(".")).join(","),
    });
    return new NextResponse(null, { status: 400 });
  }
  const envelope = envelopeResult.data;
  const eventName = envelope.event_name as RegisteredEventName;

  // 6. Consent gate. Cookie is authoritative; fall back to the body's
  //    `consent` field only if no cookie is present (currently only
  //    used by hypothetical future server-rendered pixels).
  const cookieConsent = readConsentCookie(req);
  const consentInput = cookieConsent ?? envelope.consent ?? null;
  if (consentInput === null) {
    log("info", "analytics.collect.consent_missing", { tenantId, eventName });
    return new NextResponse(null, { status: 403 });
  }
  const consentParsed = ConsentCategoriesSchema.safeParse(consentInput);
  if (!consentParsed.success) {
    log("warn", "analytics.collect.consent_malformed", { tenantId, eventName });
    return new NextResponse(null, { status: 400 });
  }
  if (!isEventConsented(eventName, consentParsed.data)) {
    log("info", "analytics.collect.consent_declined", {
      tenantId,
      eventName,
      category: STOREFRONT_EVENT_CATEGORIES[
        eventName as keyof typeof STOREFRONT_EVENT_CATEGORIES
      ],
    });
    return new NextResponse(null, { status: 403 });
  }

  // 7. Per-tenant pipeline feature flag. Kept AFTER consent so a
  //    visitor's declined-consent never appears in the
  //    `pipeline_disabled` log signal (which would muddy that
  //    counter for ops).
  const enabled = await isAnalyticsEnabledForTenant(tenantId);
  if (!enabled) {
    log("info", "analytics.collect.pipeline_disabled", { tenantId, eventName });
    return new NextResponse(null, { status: 403 });
  }

  // 8. Emit. Standalone variant — no operational tx to attach to.
  //    Worker's ULID is passed as `eventId` so the warehouse row
  //    matches the worker's sessionStorage record exactly.
  try {
    await emitAnalyticsEventStandalone({
      tenantId,
      eventName,
      schemaVersion: envelope.schema_version,
      occurredAt: new Date(envelope.occurred_at),
      actor: { actor_type: "anonymous", actor_id: null },
      payload: envelope.payload,
      correlationId: envelope.correlation_id ?? null,
      eventId: envelope.event_id,
    });
  } catch (err) {
    if (err instanceof AnalyticsValidationError) {
      log("warn", "analytics.collect.payload_invalid", {
        tenantId,
        eventName,
        schemaVersion: envelope.schema_version,
        issues: err.issues.map((i) => i.path.join(".")).join(","),
      });
      return new NextResponse(null, { status: 422 });
    }
    if (
      err instanceof AnalyticsSchemaNotRegisteredError ||
      err instanceof AnalyticsSchemaVersionMissingError
    ) {
      // Caught by the envelope's z.enum + the registry; should be
      // unreachable. Log loudly and 422 if it ever fires.
      log("error", "analytics.collect.schema_lookup_failed", {
        tenantId,
        eventName,
        schemaVersion: envelope.schema_version,
        error: err.message,
      });
      return new NextResponse(null, { status: 422 });
    }
    log("error", "analytics.collect.emit_failed", {
      tenantId,
      eventName,
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
