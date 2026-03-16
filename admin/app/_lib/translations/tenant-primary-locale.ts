// ── Per-tenant primary locale resolver ────────────────────────
//
// Single source of truth for a tenant's default language.
// Cached with 30s TTL. Explicitly invalidated on change.
// Falls back to PRIMARY_LOCALE ("sv") when no primary is set.

import { prisma } from "@/app/_lib/db/prisma";
import { PRIMARY_LOCALE } from "./locales";
import type { SupportedLocale } from "./locales";

const cache = new Map<string, { value: SupportedLocale; expiresAt: number }>();
const TTL_MS = 30_000;

/**
 * Resolve the primary/default locale for a tenant.
 * This is the ONLY function that determines a tenant's default language.
 */
export async function getTenantPrimaryLocale(tenantId: string): Promise<SupportedLocale> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await prisma.tenantLocale.findFirst({
    where: { tenantId, primary: true },
    select: { locale: true },
  });

  const locale = (row?.locale ?? PRIMARY_LOCALE) as SupportedLocale;
  cache.set(tenantId, { value: locale, expiresAt: Date.now() + TTL_MS });
  return locale;
}

/**
 * Invalidate cached primary locale for a tenant.
 * Call after changing the primary locale.
 */
export function invalidatePrimaryLocaleCache(tenantId: string): void {
  cache.delete(tenantId);
}
