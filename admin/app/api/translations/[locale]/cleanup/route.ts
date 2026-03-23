export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { isValidLocale } from "@/app/_lib/translations/locales";
import { scanTranslatableStrings } from "@/app/_lib/translations/scanner";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

type RouteContext = { params: Promise<{ locale: string }> };

// ── POST /api/translations/[locale]/cleanup ──────────────────
// Orphan cleanup. Runs synchronously — cleanup is a simple
// deleteMany and completes quickly.

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale: localeCode } = await context.params;

    if (!isValidLocale(localeCode)) {
      return NextResponse.json({ error: "Ogiltigt språk" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true, settings: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const tenantId = tenant.id;
    const publishedConfig = tenant.settings as TenantConfig | null;

    if (!publishedConfig) {
      return NextResponse.json({ error: "No published config found" }, { status: 404 });
    }

    // Run cleanup synchronously — it's a simple deleteMany, not slow
    await runCleanup(tenantId, localeCode, publishedConfig);

    return NextResponse.json({ status: "completed", locale: localeCode }, { status: 200 });
  } catch (err) {
    console.error("[translations/cleanup POST] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Background cleanup ───────────────────────────────────────

async function runCleanup(
  tenantId: string,
  locale: string,
  config: TenantConfig,
): Promise<void> {
  // Scan published config to get all current resourceIds
  const fields = scanTranslatableStrings(config, new Map(), locale);
  const currentResourceIds = new Set<string>(fields.map((f) => f.resourceId));

  // Find all stored translations for this tenant + locale
  const storedRows = await prisma.tenantTranslation.findMany({
    where: { tenantId, locale },
    select: { id: true, resourceId: true },
  });

  // Identify orphans — translations whose resourceId is not in current config
  const orphanIds = storedRows
    .filter((row) => !currentResourceIds.has(row.resourceId))
    .map((row) => row.id);

  if (orphanIds.length === 0) {
    console.log(`[translations/cleanup] No orphans found for tenant=${tenantId} locale=${locale}`);
    return;
  }

  // Delete orphans in batch
  const result = await prisma.tenantTranslation.deleteMany({
    where: { id: { in: orphanIds } },
  });

  console.log(
    `[translations/cleanup] Removed ${result.count} orphan translations for tenant=${tenantId} locale=${locale}`,
  );
}
