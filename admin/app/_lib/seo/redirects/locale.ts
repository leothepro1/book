import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";

/**
 * Tenant default locale — resolver for redirect-write scoping.
 * ═══════════════════════════════════════════════════════════
 *
 * `SeoRedirect.locale` carves the namespace so /en/foo and /sv/foo
 * can coexist once M8 ships locale-prefix routing. Until then every
 * redirect we write is scoped to the tenant's primary locale.
 *
 * Canonical source: `TenantLocale.primary=true`. If a tenant is
 * mid-setup and has no primary row yet, we fall back to "sv" — the
 * same default used by:
 *   • SeoRedirect.locale DEFAULT clause in the migration
 *   • M11.1b's /api/internal/resolve-tenant-by-host
 *   • The PRIMARY_LOCALE const in translations/locales.ts
 *
 * Keeping all four fallbacks aligned means a row inserted with the
 * fallback is still findable via middleware lookup, even for a
 * tenant that never configured their primary locale explicitly.
 *
 * The optional `client` parameter lets callers pass a transaction
 * client so the locale read is consistent with the subsequent
 * redirect write within the same transaction boundary. Without
 * this, a concurrent `UPDATE TenantLocale SET primary=...` could
 * technically race the write (acceptable for locale — which is
 * read-only within a request — but kept tight for correctness).
 */

const DEFAULT_FALLBACK_LOCALE = "sv";

export async function getTenantDefaultLocale(
  tenantId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<string> {
  const primary = await client.tenantLocale.findFirst({
    where: { tenantId, primary: true },
    select: { locale: true },
  });
  return primary?.locale ?? DEFAULT_FALLBACK_LOCALE;
}
