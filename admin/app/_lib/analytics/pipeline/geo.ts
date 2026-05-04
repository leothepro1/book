/**
 * Pipeline-side GeoIP resolution (PR-X3b).
 *
 * Resolves city + country from the request IP for inclusion in
 * `analytics.event.context.geo`. Used at `/api/analytics/collect`
 * after the consent gate so storefront events get a coarse geo
 * dimension without exposing the underlying IP or precise
 * coordinates.
 *
 * ─────────────────────────────────────────────────────────────────
 * Privacy posture (matches GDPR rekital 26 city-level rationale)
 * ─────────────────────────────────────────────────────────────────
 *
 *  - Returns ONLY country (ISO 3166 alpha-2) + city (English name).
 *  - NEVER returns or stores latitude / longitude — caller can't
 *    accidentally ship them downstream because they don't exist on
 *    the return type.
 *  - NEVER stores or logs the raw IP. Structured logs emit the
 *    derived country only (city is omitted from logs because it
 *    can correlate with session via repeat visits — country alone
 *    is too coarse to fingerprint).
 *  - Lookup is gated upstream by `consent.analytics === true`
 *    (`/api/analytics/collect` runs the consent gate BEFORE calling
 *    this helper). This module imposes no consent check itself —
 *    the boundary is the route.
 *
 * ─────────────────────────────────────────────────────────────────
 * Failure-graceful contract
 * ─────────────────────────────────────────────────────────────────
 *
 * `resolveGeoForContext` NEVER throws. Any failure path — DB file
 * missing, IP unparsable, private network, MaxMind lookup throws —
 * returns `null`. The caller in `collect/route.ts` treats `null`
 * as "no geo on this event" and proceeds to emit. A guest's
 * session is never blocked by an unavailable GeoLite2 database.
 *
 * ─────────────────────────────────────────────────────────────────
 * Why this lives separately from `app/_lib/analytics/geo.ts`
 * ─────────────────────────────────────────────────────────────────
 *
 * Legacy v1 (`app/_lib/analytics/geo.ts`) writes to the
 * `AnalyticsLocation` Postgres table and returns a `locationId`.
 * Phase 3+ pipeline events do not use that table — geo lives in
 * `event.context.geo` as opaque JSONB. Sharing the legacy helper
 * would either drag in the Prisma write (wrong shape) or require
 * conditional logic to skip it (uglier than two helpers).
 *
 * Phase 5C (when legacy v1 deprecates) can refactor both into a
 * single shared helper. Not in scope for X3b.
 */

import path from "node:path";

import { log } from "@/app/_lib/logger";

// `unknown` for the cached reader to avoid a hard dependency on the
// MaxMind type at module import time (jsdom test environments don't
// always have the native bindings; the dynamic import below is the
// only place we touch the type).
let readerPromise: Promise<unknown> | null = null;

interface MaxMindReader {
  city(ip: string): {
    country?: { isoCode?: string };
    city?: { names?: { en?: string } };
  };
}

/**
 * Open the GeoLite2-City reader once per process. Returns `null`
 * when the database file is absent (dev / CI without the
 * download-geolite2 prebuild step), the dynamic import fails, or
 * `Reader.open` throws (corrupt file, native binding mismatch).
 *
 * Mirrors the lazy-load pattern in `app/_lib/analytics/geo.ts:17-38`
 * so a missing database is never a hard error. The path check is
 * delegated to `Reader.open` itself — it raises ENOENT for missing
 * files, which our catch swallows into a `null` reader.
 */
async function getReader(): Promise<MaxMindReader | null> {
  if (readerPromise) return readerPromise as Promise<MaxMindReader | null>;

  readerPromise = (async (): Promise<MaxMindReader | null> => {
    try {
      const dbPath = path.join(process.cwd(), "lib/geo/GeoLite2-City.mmdb");
      const mod = await import("@maxmind/geoip2-node");
      const reader = await mod.Reader.open(dbPath);
      return reader as unknown as MaxMindReader;
    } catch {
      // ENOENT (file missing), native binding missing, file
      // corruption, etc — geo just becomes unavailable for this
      // process. Failure-graceful.
      return null;
    }
  })();

  return readerPromise as Promise<MaxMindReader | null>;
}

/**
 * Test-only — drop the cached reader so a subsequent
 * `resolveGeoForContext` call re-runs the lazy-load. Production
 * code never invokes this.
 */
export function _resetGeoCacheForTests(): void {
  readerPromise = null;
}

export interface GeoContext {
  /** ISO 3166-1 alpha-2 country code, uppercase. */
  country: string;
  /** English city name. */
  city: string;
}

/**
 * Resolve a geo context object for the given client IP.
 *
 * Returns `null` for any of:
 *   - "unknown" / empty / null IP (per `getClientIp` fallback)
 *   - GeoLite2 database absent or load failed
 *   - MaxMind lookup throws (unparsable IP, private network,
 *     reserved range, …)
 *   - country or city missing in the lookup result
 *
 * Caller side: when `null` is returned, `event.context.geo` is
 * omitted entirely. The schema (`Json?`) tolerates absence and
 * Phase 5 aggregators map missing-geo to the "unknown" bucket per
 * Phase 5A recon §2.10.
 *
 * @param ip — client IP from `X-Forwarded-For` first hop
 * @param tenantId — included in structured logs only, never in DB
 */
export async function resolveGeoForContext(
  ip: string,
  tenantId: string,
): Promise<GeoContext | null> {
  if (!ip || ip === "unknown") {
    return null;
  }

  const reader = await getReader();
  if (!reader) {
    // First call after process start hits this branch when the
    // GeoLite2 download didn't run (preview deploys may skip it).
    // Logged once; the warn fires per-request which is fine — a
    // tenant with consistent geo absence is the actionable signal.
    log("warn", "analytics.geo.unavailable", {
      tenantId,
      reason: "reader_unavailable",
    });
    return null;
  }

  // IPv4-mapped IPv6 has the form `::ffff:1.2.3.4` — MaxMind's
  // city() rejects the prefix. Strip it for compatibility.
  const cleanIp = ip.replace(/^::ffff:/, "");

  let result: ReturnType<MaxMindReader["city"]>;
  try {
    result = reader.city(cleanIp);
  } catch {
    // MaxMind throws on private networks, reserved ranges,
    // unparsable strings. All "no geo" — graceful fallback.
    return null;
  }

  const country = result.country?.isoCode;
  const city = result.city?.names?.en;
  if (typeof country !== "string" || country.length === 0) return null;
  if (typeof city !== "string" || city.length === 0) return null;

  log("info", "analytics.geo.resolved", { tenantId, country });
  // City is intentionally NOT logged — it's coarse enough to be
  // public-OK in event.context, but in logs it pairs with tenantId
  // and request timing which can build a rough fingerprint.
  // Country alone is too coarse to fingerprint.

  return { country, city };
}
