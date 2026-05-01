/**
 * Tenant-environment helpers for Phase 5+ aggregations.
 *
 * Staging events live in the SAME outbox/event tables as production
 * (analytics.outbox, analytics.event). Aggregation queries MUST
 * filter explicitly because environment is a row attribute, not a
 * schema attribute — there is no separate staging schema, no
 * separate staging DB, no row-level isolation. The Phase 5+ query
 * author who forgets this filter pollutes production metrics with
 * staging traffic.
 *
 * Two complementary flags exist on different models:
 *
 *   Tenant.environment              ← THIS module — tenant-level,
 *                                     drives aggregation filtering.
 *                                     Phase 5+ queries import
 *                                     PRODUCTION_TENANT_FILTER from
 *                                     here.
 *
 *   TenantIntegration.isDemoEnvironment ← integration-level, drives
 *                                     PMS/payment adapter behavior
 *                                     (e.g. fake adapter mode,
 *                                     demo data, no real Mews
 *                                     writes). Lives on the
 *                                     TenantIntegration row, not on
 *                                     Tenant. Set in tandem with
 *                                     environment="staging" by the
 *                                     seed script in
 *                                     scripts/seed-staging-tenant.ts.
 *
 * They are NOT interchangeable. They serve different purposes at
 * different layers. See docs/analytics/phase3-5-staging-setup.md
 * for the full mapping.
 */

import { TenantEnvironment } from "@prisma/client";

/**
 * Prisma `where` clause filter for production-only queries. Use as a
 * spread or a partial — both shapes are typed.
 *
 *   prisma.tenant.findMany({ where: PRODUCTION_TENANT_FILTER });
 *   prisma.tenant.findMany({
 *     where: { ...PRODUCTION_TENANT_FILTER, status: "active" },
 *   });
 */
export const PRODUCTION_TENANT_FILTER = {
  environment: TenantEnvironment.production,
} as const;

/** Mirror of {@link PRODUCTION_TENANT_FILTER} for staging-only queries. */
export const STAGING_TENANT_FILTER = {
  environment: TenantEnvironment.staging,
} as const;

/**
 * True iff the supplied tenant (or projection) is a production
 * tenant. Accepts a minimal `{ environment }` projection so callers
 * can use it on lightweight reads without selecting every column.
 */
export function isProductionTenant(t: {
  environment: TenantEnvironment;
}): boolean {
  return t.environment === TenantEnvironment.production;
}

/**
 * True iff the supplied tenant (or projection) is a staging tenant.
 * Accepts the same minimal `{ environment }` projection as
 * {@link isProductionTenant}.
 */
export function isStagingTenant(t: {
  environment: TenantEnvironment;
}): boolean {
  return t.environment === TenantEnvironment.staging;
}

// Re-export the enum for convenience so callers don't need a second
// import path. `import { TenantEnvironment, isProductionTenant }
// from "@/app/_lib/analytics/pipeline/environment"` works either way.
export { TenantEnvironment };
