export const dynamic = "force-dynamic";

/**
 * Internal route — resolve tenant + default locale from host.
 * ════════════════════════════════════════════════════════════
 *
 * Called from middleware (edge runtime, cannot use Prisma) before
 * the SEO redirect lookup. Secured with `x-cron-secret` — NOT
 * tenant-facing.
 *
 * Host resolution mirrors the guest-side `resolveTenantFromHost`:
 *
 *   Production: `{portalSlug}.{platform-base-domain}` → split on
 *   first `.`, lookup by `portalSlug`.
 *
 *   Development: localhost / 127.0.0.1 / *.app.github.dev → fall
 *   back to the DEV_ORG_ID → clerkOrgId lookup. Without this,
 *   redirects wouldn't fire at all on local dev.
 *
 * Default locale: Tenant has no `defaultLocale` column —
 * canonical source is `TenantLocale.primary=true`. Falls back to
 * "sv" (matches PRIMARY_LOCALE + the schema default on
 * SeoRedirect.locale, so a write without explicit locale still
 * aligns with lookups).
 */

import { NextResponse } from "next/server";

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

const FALLBACK_LOCALE = "sv";

function isDevHost(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".app.github.dev")
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const host = new URL(request.url).searchParams.get("host");
  if (!host) {
    return NextResponse.json({ error: "Missing host" }, { status: 400 });
  }

  let tenant: { id: string } | null = null;

  if (isDevHost(host)) {
    if (env.DEV_ORG_ID) {
      tenant = await prisma.tenant.findUnique({
        where: { clerkOrgId: env.DEV_ORG_ID },
        select: { id: true },
      });
    }
  } else {
    const dotIndex = host.indexOf(".");
    if (dotIndex > 0) {
      const portalSlug = host.slice(0, dotIndex);
      if (portalSlug) {
        tenant = await prisma.tenant.findUnique({
          where: { portalSlug },
          select: { id: true },
        });
      }
    }
  }

  if (!tenant) {
    return NextResponse.json({ tenant: null });
  }

  const primary = await prisma.tenantLocale.findFirst({
    where: { tenantId: tenant.id, primary: true },
    select: { locale: true },
  });

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      defaultLocale: primary?.locale ?? FALLBACK_LOCALE,
    },
  });
}
