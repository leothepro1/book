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
 * ## Phase 2 (this PR) — backfill complete; salt now present on all rows
 *                         but type still optional pending Phase 3 tightening
 *
 * The Phase 2 migration (`20260503134853_analytics_backfill_tenant_salt`)
 * writes a fresh 32-hex salt onto every Tenant row that was missing one.
 * The migration ends with a `DO`-block that aborts the transaction if any
 * row remains without a valid salt, so a successful apply means every row
 * has been backfilled.
 *
 * `AnalyticsSettings.analyticsSalt` stays `string | undefined` and
 * `getAnalyticsSalt` continues to return `undefined` + structured-log on
 * absence. This is deliberate: until Phase 3 lands, the storefront read
 * path must not 500 a tenant that somehow escaped the backfill (defense in
 * depth — the structured log surfaces the case for ops review). The new
 * `assertAnalyticsSaltPresent` helper is the Phase 3 entry point and
 * throws on absence; it is wired in below but no callers use it yet.
 *
 * ## Phase 3 — required (NOT this PR)
 *
 * Once production telemetry confirms zero `analytics.tenant_missing_salt`
 * events for a soak period, a follow-up commit:
 *   1. Tightens the type to `analyticsSalt: string` (required).
 *   2. Switches the default callers from `getAnalyticsSalt` to
 *      `assertAnalyticsSaltPresent`.
 *   3. (Optional) folds the throw into `getAnalyticsSalt` itself.
 * The throw is the right server-side signal for a data-integrity bug —
 * a Tenant without a salt post-backfill is a class of bug we want
 * surfaced as a 500, not silently emitted unsalted.
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
 * Phase 3 entry point — read `analyticsSalt` and throw if absent.
 *
 * Mirrors `getAnalyticsSalt` but converts every "missing or malformed"
 * outcome into a thrown Error tagged with the tenantId. Phase 2 adds the
 * helper but does NOT switch existing callers over — the storefront read
 * path keeps using `getAnalyticsSalt` so a backfill miss degrades
 * gracefully instead of 500-ing the page. Phase 3 will swap the callers.
 *
 * The thrown message is the platform contract: post-Phase-2, a tenant
 * without a valid salt is a data-integrity bug (the migration's DO-block
 * verifies zero nulls before commit). Surfacing it as a 500 is the
 * correct signal — silent fallback would hide the regression.
 */
export function assertAnalyticsSaltPresent(
  tenant: Pick<Tenant, "id" | "settings">,
): string {
  const salt = getAnalyticsSalt(tenant);
  if (!salt) {
    throw new Error(
      `analytics salt missing post-backfill — Phase 3 invariant violated; tenantId=${tenant.id}`,
    );
  }
  return salt;
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
