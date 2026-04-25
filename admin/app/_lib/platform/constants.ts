/**
 * Platform-level constants. Single source of truth for the Bedfront platform host
 * (the equivalent of Shopify's myshopify.com).
 *
 * NEXT_PUBLIC_BASE_DOMAIN is read at build time and inlined. The fallback to
 * "rutgr.com" applies only to local dev. Production deployments MUST set the
 * env var explicitly.
 *
 * Do not import this module from middleware. Middleware is edge-runtime and
 * must read env vars directly via process.env (no Zod accessor).
 */

const FALLBACK_BASE_DOMAIN = "rutgr.com";

export function getPlatformBaseDomain(): string {
  return process.env.NEXT_PUBLIC_BASE_DOMAIN || FALLBACK_BASE_DOMAIN;
}

/**
 * The platform protocol. Always https in production. http allowed only when
 * NODE_ENV === "development" AND the host is a localhost variant.
 */
export function getPlatformProtocol(host?: string): "http" | "https" {
  if (process.env.NODE_ENV !== "development") return "https";
  if (!host) return "https";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return "http";
  return "https";
}
