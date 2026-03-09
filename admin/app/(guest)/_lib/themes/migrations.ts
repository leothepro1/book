/**
 * Theme Settings Migration Runner
 *
 * When a theme manifest is updated (slots renamed, fields added/removed,
 * defaults changed), tenants with stored settings from an older version
 * need those settings migrated to match the new schema.
 *
 * The engine calls `migrateSettings()` on every render. If the tenant's
 * themeVersion matches the manifest version, this is a no-op. If not,
 * it runs the migration chain and returns the migrated settings.
 *
 * Migrations are defined per-manifest in `manifest.migrations`.
 * Each key is a target version (SemVer), and migrations run in order
 * from tenantVersion → manifestVersion.
 *
 * This is a READ-PATH operation — it transforms settings in memory.
 * The engine can optionally persist the migrated settings back to the
 * tenant's config (lazy migration), but that's a separate concern.
 */

import type { ThemeManifest, TenantSectionSettings } from "./types";

export type MigrationResult = {
  /** The migrated settings (may be identical to input if no migration needed). */
  settings: TenantSectionSettings;
  /** Whether any migrations were applied. */
  migrated: boolean;
  /** The version after migration (manifest.version if migrated, tenantVersion if not). */
  resolvedVersion: string;
  /** Versions that were applied, in order. Empty if no migration needed. */
  appliedVersions: string[];
};

/**
 * Compare two SemVer strings. Returns -1, 0, or 1.
 */
function compareSemVer(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Run settings migrations from tenantVersion → manifest.version.
 *
 * If the tenant has no version (null — legacy), all migrations run.
 * If no migrations are defined, settings pass through unchanged.
 * Returns the migrated settings and metadata about what was applied.
 */
export function migrateSettings(
  settings: TenantSectionSettings,
  manifest: ThemeManifest,
  tenantVersion: string | null,
): MigrationResult {
  const manifestVersion = manifest.version;

  // No migration needed: versions match
  if (tenantVersion === manifestVersion) {
    return {
      settings,
      migrated: false,
      resolvedVersion: manifestVersion,
      appliedVersions: [],
    };
  }

  // No migrations defined on this manifest
  if (!manifest.migrations || Object.keys(manifest.migrations).length === 0) {
    return {
      settings,
      migrated: false,
      resolvedVersion: tenantVersion ?? manifestVersion,
      appliedVersions: [],
    };
  }

  // Sort migration versions ascending
  const migrationVersions = Object.keys(manifest.migrations).sort(compareSemVer);

  // Filter to only versions > tenantVersion (or all if tenantVersion is null)
  const applicable = migrationVersions.filter((v) => {
    if (tenantVersion === null) return true; // Legacy: run all migrations
    return compareSemVer(v, tenantVersion) > 0;
  });

  if (applicable.length === 0) {
    return {
      settings,
      migrated: false,
      resolvedVersion: tenantVersion ?? manifestVersion,
      appliedVersions: [],
    };
  }

  // Run migrations in order
  let current = { ...settings };
  const appliedVersions: string[] = [];

  for (const version of applicable) {
    const migrate = manifest.migrations![version];
    try {
      current = migrate(current);
      appliedVersions.push(version);
    } catch (err) {
      console.error(
        `[ThemeMigration] Migration to v${version} failed for theme "${manifest.id}":`,
        err,
      );
      // Stop migration chain on failure — partial migration is worse than none
      break;
    }
  }

  return {
    settings: current,
    migrated: appliedVersions.length > 0,
    resolvedVersion: appliedVersions.length > 0
      ? appliedVersions[appliedVersions.length - 1]
      : (tenantVersion ?? manifestVersion),
    appliedVersions,
  };
}
