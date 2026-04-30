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
 *   1. The host header MUST match `<slug>.bedfront.com` — the canonical
 *      storefront domain. Hostname-only check (no port allowed in prod).
 *   2. The Origin header, when present, MUST match the same
 *      `<slug>.bedfront.com` form, scheme `https`. The slug in Origin
 *      MUST equal the slug in Host. (Worker scripts always send Origin;
 *      only `Origin: null` is tolerated for opaque origins, which is a
 *      sandboxed-iframe edge case.)
 *   3. `*.vercel.app` is accepted ONLY when `process.env.VERCEL_ENV ===
 *      "preview"`. Production deployments on vercel.app are still
 *      bedfront.com via the custom domain — accepting *.vercel.app in
 *      prod would let any preview deploy POST into the production
 *      pipeline.
 *   4. localhost is NEVER accepted in production. This is the explicit
 *      "even if a developer leaves a dev override on" backstop.
 *
 * Development rules (NODE_ENV !== "production"):
 *
 *   - Accept localhost / 127.0.0.1 / *.app.github.dev (Codespaces) on
 *     any port. The dev environment can't sign requests from
 *     <slug>.bedfront.com because the dev tenant has no DNS for it.
 *
 * The Origin/Host check runs BEFORE rate limiting so a misconfigured
 * client doesn't burn the rate-limit bucket on rejected origins.
 */

// Slug capture: index 1 = the subdomain. Indexed groups (not named)
// because the project's tsconfig target predates ES2018.
const PROD_HOST_REGEX = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bedfront\.com$/;
const PROD_ORIGIN_REGEX = /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bedfront\.com$/;
const VERCEL_PREVIEW_HOST_REGEX = /\.vercel\.app$/;
const VERCEL_PREVIEW_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

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
  const { host, origin, nodeEnv, vercelEnv } = input;

  if (!host) return { ok: false, reason: "host_missing" };

  const isProd = nodeEnv === "production";

  if (isProd) {
    return checkProd(host, origin, vercelEnv);
  }
  return checkDev(host, origin);
}

function checkProd(
  host: string,
  origin: string | null,
  vercelEnv: string | undefined,
): OriginCheckResult {
  const hostMatch = host.match(PROD_HOST_REGEX);
  const isVercelPreview =
    vercelEnv === "preview" && VERCEL_PREVIEW_HOST_REGEX.test(host);

  if (!hostMatch && !isVercelPreview) {
    return { ok: false, reason: "host_invalid_in_prod" };
  }

  // Vercel preview tolerance — only when VERCEL_ENV says so.
  if (!hostMatch && isVercelPreview) {
    if (origin === null || origin === "null") return OK;
    if (VERCEL_PREVIEW_ORIGIN_REGEX.test(origin)) return OK;
    return { ok: false, reason: "vercel_preview_in_prod_only" };
  }

  // Canonical bedfront.com host. Origin must match same slug (or be null).
  const hostSlug = hostMatch![1];
  if (origin === null || origin === "null") return OK;

  const originMatch = origin.match(PROD_ORIGIN_REGEX);
  if (!originMatch) return { ok: false, reason: "origin_invalid_in_prod" };

  const originSlug = originMatch[1];
  if (originSlug !== hostSlug) {
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
