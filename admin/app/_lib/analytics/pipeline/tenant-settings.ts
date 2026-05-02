/**
 * Analytics-specific projection of `Tenant.settings`.
 *
 * `Tenant.settings` is a `Json?` field (per `prisma/schema.prisma`) with
 * an implicitly-typed shape spread across many readers/writers in the
 * codebase. Rather than introduce a centralized `TenantSettings` type
 * (large, cross-cutting refactor), we expose ONLY the analytics
 * fragment here. Other features keep reading `tenant.settings` ad-hoc;
 * the analytics pipeline reads through this module exclusively.
 *
 * ## Phase 1 (this PR) — optional salt
 *
 * `analyticsSalt` is `string | undefined`. New tenant rows get the
 * salt at creation time (Phase 1 covers webhook + dev seed scripts).
 * Old tenant rows lack it until the Phase 2 backfill migration runs.
 * `getAnalyticsSalt` returns `undefined` for those rows and structured-
 * logs the absence so we can spot any tenants that escaped the
 * backfill.
 *
 * ## Phase 3 — required (NOT this PR)
 *
 * Once the backfill confirms 0 nulls in production, a follow-up commit
 * tightens the type to `string` (required) and `getAnalyticsSalt`
 * throws on absence. The throw is the right server-side signal for a
 * data-integrity bug. Until that tightening, the helper logs and
 * returns `undefined` so pre-backfill rows don't 500 the storefront.
 *
 * ## Salt construction
 *
 * 32 hex characters from `crypto.randomBytes(16)`. The salt is per-
 * tenant and stored server-side. It is NOT cryptographic-secret in
 * the strong sense — it's a per-tenant namespace separator that
 * prevents cross-tenant `user_agent_hash` stitching. Exposing it to
 * the client at SSR time is the design (see
 * `app/(guest)/_components/AnalyticsLoader.tsx`).
 */

import type { Tenant } from "@prisma/client";

import { log } from "@/app/_lib/logger";

/**
 * The analytics fragment of `Tenant.settings`. Keep narrow — only
 * fields the analytics pipeline reads.
 */
export type AnalyticsSettings = {
  /**
   * Per-tenant salt for `user_agent_hash` construction. 32 hex chars
   * (from `crypto.randomBytes(16)`).
   *
   * Phase 1: optional — pre-backfill rows lack it.
   * Phase 3: required — backfill verified, missing values throw.
   */
  analyticsSalt: string | undefined;
};

const SALT_HEX_LENGTH = 32;
const SALT_MIN_VALID_LENGTH = 16; // half-length tolerance for future shorter salts; current path always 32

/**
 * Read `analyticsSalt` from a tenant's settings. Returns `undefined`
 * when the field is missing, malformed, or shorter than the minimum
 * length. Server-side callers fall back to omitting the salt at the
 * SSR injection point (which the loader treats as unsalted).
 *
 * In Phase 3 this function will throw on absence — the throw is
 * deliberate: a tenant without a salt post-backfill is a data-
 * integrity bug worth surfacing as a 500 on the affected request,
 * not a silent unsalted emit.
 */
export function getAnalyticsSalt(
  tenant: Pick<Tenant, "id" | "settings">,
): string | undefined {
  const settings = tenant.settings as
    | { analyticsSalt?: unknown }
    | null
    | undefined;
  const raw = settings?.analyticsSalt;
  if (typeof raw !== "string") {
    log("warn", "analytics.tenant_missing_salt", {
      tenantId: tenant.id,
      reason: raw === undefined ? "absent" : "non_string",
      phase: "phase_a_optional",
    });
    return undefined;
  }
  if (raw.length < SALT_MIN_VALID_LENGTH) {
    log("warn", "analytics.tenant_invalid_salt", {
      tenantId: tenant.id,
      reason: "too_short",
      length: raw.length,
      phase: "phase_a_optional",
    });
    return undefined;
  }
  return raw;
}

/**
 * Generate a fresh per-tenant analytics salt. 32 hex chars from 16
 * cryptographically-random bytes. Use at tenant-creation time and in
 * the Phase 2 backfill migration's row-by-row default.
 *
 * Server-side only — depends on Node's `crypto`. The browser-side
 * loader never calls this; it reads the salt that SSR injected.
 */
export async function generateAnalyticsSalt(): Promise<string> {
  // Dynamic import to keep this module bundleable from contexts that
  // shouldn't pull `node:crypto` (no current consumer needs that, but
  // belt-and-braces).
  const { randomBytes } = await import("node:crypto");
  return randomBytes(SALT_HEX_LENGTH / 2).toString("hex");
}
