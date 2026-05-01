/**
 * Same-origin gate for the public analytics-collect endpoint (Phase 3, Q7).
 *
 * The dispatch endpoint accepts cross-origin POST traffic from the
 * tenant's storefront and only the storefront. The same-origin contract
 * is BOTH the host header (which Next.js sets for us) AND the Origin
 * header (which the worker sends and which we re-validate here).
 *
 * Production rules (NODE_ENV === "production"):
 *
 *   1. The host header MUST match `<slug>.<baseDomain>` — the canonical
 *      storefront domain, where baseDomain comes from
 *      `getPlatformBaseDomain()` (NEXT_PUBLIC_BASE_DOMAIN env var,
 *      fallback "rutgr.com"). Hostname-only check (no port allowed in
 *      prod). Naked root domain (e.g. "rutgr.com" with no subdomain) is
 *      rejected — the regex requires a slug prefix.
 *   2. The Origin header, when present, MUST match the same
 *      `<slug>.<baseDomain>` form, scheme `https`. The slug in Origin
 *      MUST equal the slug in Host. (Worker scripts always send Origin;
 *      only `Origin: null` is tolerated for opaque origins, which is a
 *      sandboxed-iframe edge case.)
 *   3. `*.vercel.app` is accepted ONLY when `process.env.VERCEL_ENV ===
 *      "preview"`. Production deployments on vercel.app are still
 *      reached via the custom domain — accepting *.vercel.app in prod
 *      would let any preview deploy POST into the production pipeline.
 *   4. `*.bedfront.com` is accepted ONLY on Vercel previews, regardless
 *      of the configured baseDomain. This covers the operational case
 *      where preview deploys may run against either the platform's
 *      current domain (rutgr.com) or a future/legacy one (bedfront.com)
 *      without code changes. It is NEVER accepted in production unless
 *      it equals the configured baseDomain.
 *   5. localhost is NEVER accepted in production. This is the explicit
 *      "even if a developer leaves a dev override on" backstop.
 *
 * Development rules (NODE_ENV !== "production"):
 *
 *   - Accept localhost / 127.0.0.1 / *.app.github.dev (Codespaces) on
 *     any port. The dev environment can't sign requests from
 *     <slug>.<baseDomain> because the dev tenant has no DNS for it.
 *
 * The Origin/Host check runs BEFORE rate limiting so a misconfigured
 * client doesn't burn the rate-limit bucket on rejected origins.
 */

// Escape regex meta-chars in a string literal so it can be embedded
// inside a `new RegExp(...)`. The platform base domain is operator-
// configurable via NEXT_PUBLIC_BASE_DOMAIN; we never want a `.` in the
// base domain to match arbitrary characters.
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Per-baseDomain regex memoization. The base domain is read from env
// once per request, so caching by string keeps origin checking cheap
// on the hot path.
type BaseRegexes = { host: RegExp; origin: RegExp };
const baseRegexCache = new Map<string, BaseRegexes>();

function getBaseRegexes(baseDomain: string): BaseRegexes {
  const cached = baseRegexCache.get(baseDomain);
  if (cached) return cached;
  const escaped = escapeRegexLiteral(baseDomain);
  // Slug capture: index 1 = the subdomain. The slug pattern matches
  // RFC 1123 hostname labels (1–63 chars, lowercase alnum + hyphens,
  // no leading/trailing hyphen). The trailing `\.${escaped}$` requires
  // an explicit `.<baseDomain>` after the slug, so naked `<baseDomain>`
  // (no slug) cannot match.
  const built: BaseRegexes = {
    host: new RegExp(
      `^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${escaped}$`,
    ),
    origin: new RegExp(
      `^https:\\/\\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${escaped}$`,
    ),
  };
  baseRegexCache.set(baseDomain, built);
  return built;
}

// Vercel preview regexes — independent of the configured base domain.
const VERCEL_PREVIEW_HOST_REGEX = /\.vercel\.app$/;
const VERCEL_PREVIEW_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

// Legacy preview regex: `*.bedfront.com` accepted ONLY on previews,
// regardless of the configured baseDomain. Hardcoded by design — this
// is a known operational tolerance, not a configurable surface.
const LEGACY_PREVIEW_HOST_REGEX =
  /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bedfront\.com$/;
const LEGACY_PREVIEW_ORIGIN_REGEX =
  /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bedfront\.com$/;

const DEV_HOST_PATTERNS = [
  /^localhost(?::\d+)?$/,
  /^127\.0\.0\.1(?::\d+)?$/,
  /^[a-z0-9-]+\.app\.github\.dev$/,
];
const DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.app\.github\.dev$/,
];

export interface OriginCheckInput {
  /** `host` header value (Next.js sets this from the request line). */
  host: string | null;
  /** `Origin` header value, or null when the browser omits it. */
  origin: string | null;
  /** `process.env.NODE_ENV` — pass through for testability. */
  nodeEnv: string | undefined;
  /** `process.env.VERCEL_ENV` — `"preview" | "production" | "development"`. */
  vercelEnv: string | undefined;
  /**
   * Platform base domain for production / preview matching, e.g.
   * "rutgr.com". Caller passes `getPlatformBaseDomain()` from
   * `app/_lib/platform/constants.ts`. Required so the gate is a pure
   * function — no env reads inside the check.
   */
  baseDomain: string;
}

export interface OriginCheckResult {
  ok: boolean;
  /** Reason string for structured logs / error responses. Stable identifiers. */
  reason:
    | "ok"
    | "host_missing"
    | "host_invalid_in_prod"
    | "host_invalid_in_dev"
    | "origin_invalid_in_prod"
    | "origin_invalid_in_dev"
    | "origin_slug_mismatch"
    | "vercel_preview_in_prod_only";
}

const OK: OriginCheckResult = { ok: true, reason: "ok" };

/**
 * Returns `{ ok: true }` when the request's Host + Origin pair is
 * acceptable for the current environment, or `{ ok: false, reason }`
 * with a stable reason identifier suitable for logging.
 */
export function checkAnalyticsOrigin(input: OriginCheckInput): OriginCheckResult {
  const { host, origin, nodeEnv, vercelEnv, baseDomain } = input;

  if (!host) return { ok: false, reason: "host_missing" };

  const isProd = nodeEnv === "production";

  if (isProd) {
    return checkProd(host, origin, vercelEnv, baseDomain);
  }
  return checkDev(host, origin);
}

function checkProd(
  host: string,
  origin: string | null,
  vercelEnv: string | undefined,
  baseDomain: string,
): OriginCheckResult {
  const baseRe = getBaseRegexes(baseDomain);
  const isPreview = vercelEnv === "preview";

  // 1. Canonical baseDomain match — accepted in both prod and preview.
  const hostMatch = host.match(baseRe.host);
  if (hostMatch) {
    return matchOriginAgainstHostSlug(origin, hostMatch[1], baseRe.origin);
  }

  // 2. Preview-only tolerances (legacy bedfront.com + vercel.app). Both
  //    are rejected in production proper.
  if (isPreview) {
    const legacyMatch = host.match(LEGACY_PREVIEW_HOST_REGEX);
    if (legacyMatch) {
      return matchOriginAgainstHostSlug(
        origin,
        legacyMatch[1],
        LEGACY_PREVIEW_ORIGIN_REGEX,
      );
    }
    if (VERCEL_PREVIEW_HOST_REGEX.test(host)) {
      if (origin === null || origin === "null") return OK;
      if (VERCEL_PREVIEW_ORIGIN_REGEX.test(origin)) return OK;
      return { ok: false, reason: "vercel_preview_in_prod_only" };
    }
  }

  return { ok: false, reason: "host_invalid_in_prod" };
}

function matchOriginAgainstHostSlug(
  origin: string | null,
  hostSlug: string,
  originRegex: RegExp,
): OriginCheckResult {
  if (origin === null || origin === "null") return OK;
  const originMatch = origin.match(originRegex);
  if (!originMatch) return { ok: false, reason: "origin_invalid_in_prod" };
  if (originMatch[1] !== hostSlug) {
    return { ok: false, reason: "origin_slug_mismatch" };
  }
  return OK;
}

function checkDev(host: string, origin: string | null): OriginCheckResult {
  const hostOk = DEV_HOST_PATTERNS.some((re) => re.test(host));
  if (!hostOk) return { ok: false, reason: "host_invalid_in_dev" };

  if (origin === null || origin === "null") return OK;
  const originOk = DEV_ORIGIN_PATTERNS.some((re) => re.test(origin));
  if (!originOk) return { ok: false, reason: "origin_invalid_in_dev" };
  return OK;
}
