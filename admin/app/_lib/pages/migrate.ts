/**
 * Config Migration: v1 → v2 Pages
 * ═════════════════════════════════
 *
 * Migrates legacy TenantConfig where page data (sections, header, footer)
 * was stored under config.home.* to the v2 structure.
 *
 * This migration is idempotent — running it on already-migrated configs
 * is a no-op. It is safe to call on every config load.
 *
 * What moves:
 *   config.home.sections → config.pages.home.sections
 *   config.home.header   → config.globalHeader
 *   config.home.footer   → config.globalFooter
 *
 * What stays:
 *   config.home.cards, config.home.links, config.home.archivedCards
 *   — these are home-specific legacy content, not page-scoped data.
 */

import type { TenantConfig, PageConfig } from "@/app/(guest)/_lib/tenant/types";
import type { PageId } from "./types";
import { getPageDefinition } from "./registry";

/**
 * Check whether a config has been migrated to v2 pages.
 * A config is considered v2 if it has a non-empty pages map.
 */
export function isV2Config(config: TenantConfig): boolean {
  return config.pages !== undefined && Object.keys(config.pages).length > 0;
}

/**
 * Migrate a TenantConfig from v1 (home-centric) to v2 (pages map).
 *
 * Idempotent: if config.pages already exists and has data, returns as-is.
 * Pure function: returns a new object, does not mutate input.
 */
export function migrateToV2Pages(config: TenantConfig): TenantConfig {
  let result = config;

  // Step 1: v1 → v2 pages migration
  if (!isV2Config(result)) {
    const homePageConfig: PageConfig = {
      enabled: true,
      layoutId: getPageDefinition("home").defaultLayout,
      sections: result.home?.sections ?? [],
    };

    const pages: Partial<Record<PageId, PageConfig>> = {
      home: homePageConfig,
    };

    result = {
      ...result,
      globalHeader: result.home?.header ?? result.globalHeader,
      globalFooter: result.home?.footer ?? result.globalFooter,
      pages,
    };
  }

  // Step 2: Promote per-page header/footer to global (for existing v2 tenants)
  result = migratePerPageHeaderFooterToGlobal(result);

  return result;
}

/**
 * Promotes per-page header/footer config to globalHeader/globalFooter.
 * Picks the first non-undefined header/footer found across pages.
 * Strips the header/footer keys from page configs.
 * Idempotent — no-op if no per-page header/footer exists.
 */
function migratePerPageHeaderFooterToGlobal(config: TenantConfig): TenantConfig {
  if (!config.pages) return config;

  let foundHeader = config.globalHeader;
  let foundFooter = config.globalFooter;
  let needsMigration = false;

  // Scan pages for legacy per-page header/footer
  for (const pageConfig of Object.values(config.pages)) {
    if (!pageConfig) continue;
    const pc = pageConfig as any;
    if (pc.header && !foundHeader) {
      foundHeader = pc.header;
      needsMigration = true;
    }
    if (pc.footer && !foundFooter) {
      foundFooter = pc.footer;
      needsMigration = true;
    }
  }

  if (!needsMigration) return config;

  // Strip header/footer from all page configs
  const cleanedPages: typeof config.pages = {};
  for (const [key, pageConfig] of Object.entries(config.pages)) {
    if (!pageConfig) continue;
    const { header, footer, ...rest } = pageConfig as any;
    cleanedPages[key as PageId] = rest;
  }

  return {
    ...config,
    globalHeader: foundHeader,
    globalFooter: foundFooter,
    pages: cleanedPages,
  };
}

/**
 * Build a migration patch suitable for updateDraft() / deepmerge.
 * Returns only the pages field — does not duplicate other config fields.
 *
 * Use this when you want to persist the migration without a full config rewrite.
 */
export function buildMigrationPatch(
  config: TenantConfig,
): Partial<TenantConfig> | null {
  const migrated = migrateToV2Pages(config);

  // Check if anything changed
  if (migrated === config) return null;

  return {
    pages: migrated.pages,
    globalHeader: migrated.globalHeader,
    globalFooter: migrated.globalFooter,
  };
}
