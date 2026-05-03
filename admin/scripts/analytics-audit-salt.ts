/**
 * Post-migrate audit — count tenants by analyticsSalt presence.
 *
 *   $ npm run analytics:audit-salt
 *
 * Phase 2 of loader hardening backfills `Tenant.settings -> 'analyticsSalt'`
 * via SQL. SQL can't emit a structured `log()` line, so this script is
 * the post-migrate companion: it runs a single counting query and reports
 * the result via the platform logger so the count lands in the same
 * pipeline as every other analytics observability event.
 *
 * Exit codes:
 *   0 — every Tenant has a valid salt (length ≥ 16)
 *   1 — at least one Tenant is still missing a valid salt
 *
 * Run safely: read-only query, no writes. Uses the same Prisma singleton
 * the application uses (no new pool).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const SALT_MIN_VALID_LENGTH = 16;

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    Array<{ total: bigint; with_salt: bigint; without: bigint }>
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (
        WHERE "settings" ->> 'analyticsSalt' IS NOT NULL
          AND length("settings" ->> 'analyticsSalt') >= ${SALT_MIN_VALID_LENGTH}
      )::bigint AS with_salt,
      COUNT(*) FILTER (
        WHERE "settings" ->> 'analyticsSalt' IS NULL
           OR length("settings" ->> 'analyticsSalt') < ${SALT_MIN_VALID_LENGTH}
      )::bigint AS without
    FROM "Tenant"
  `;

  const total = Number(rows[0]?.total ?? 0n);
  const withSalt = Number(rows[0]?.with_salt ?? 0n);
  const without = Number(rows[0]?.without ?? 0n);

  if (without === 0) {
    log("info", "analytics.salt_backfill_complete", {
      tenantsTotal: total,
      tenantsWithSalt: withSalt,
      tenantsWithoutSalt: without,
      phase: "phase_b_backfill",
    });
    process.exit(0);
  }

  log("error", "analytics.salt_backfill_incomplete", {
    tenantsTotal: total,
    tenantsWithSalt: withSalt,
    tenantsWithoutSalt: without,
    phase: "phase_b_backfill",
  });
  process.exit(1);
}

main()
  .catch((err) => {
    log("error", "analytics.salt_audit_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
