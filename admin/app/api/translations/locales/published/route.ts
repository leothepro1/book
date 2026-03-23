export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

// ── GET /api/translations/locales/published ──────────────────
// Internal route for middleware to check locale published state
// and resolve token → tenantId. Secured with x-cron-secret.
// Not exposed to tenants — only called by middleware on cache miss.
//
// Two modes:
//   ?tenantId=X&locale=Y  → returns { published: boolean }
//   ?resolveToken=T       → returns { tenantId: string | null }

export async function GET(request: NextRequest) {
  // Verify internal secret
  const secret = request.headers.get("x-cron-secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolveToken = request.nextUrl.searchParams.get("resolveToken");

  // Mode 1: resolve token → tenantId
  if (resolveToken) {
    // Try MagicLink first
    const magic = await prisma.magicLink.findUnique({
      where: { token: resolveToken },
      select: { booking: { select: { tenantId: true } } },
    });

    let tenantId: string | null = magic?.booking?.tenantId ?? null;

    // Fallback: try direct booking ID
    if (!tenantId) {
      const booking = await prisma.booking.findUnique({
        where: { id: resolveToken },
        select: { tenantId: true },
      });
      tenantId = booking?.tenantId ?? null;
    }

    // Also resolve primary locale for this tenant
    let primaryLocale: string | null = null;
    if (tenantId) {
      const primary = await prisma.tenantLocale.findFirst({
        where: { tenantId, primary: true },
        select: { locale: true },
      });
      primaryLocale = primary?.locale ?? null;
    }

    return NextResponse.json({ tenantId, primaryLocale });
  }

  // Mode 2: check locale published state
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const locale = request.nextUrl.searchParams.get("locale");

  if (!tenantId || !locale) {
    return NextResponse.json({ error: "Missing tenantId or locale" }, { status: 400 });
  }

  const row = await prisma.tenantLocale.findUnique({
    where: { tenantId_locale: { tenantId, locale } },
    select: { published: true },
  });

  return NextResponse.json({ published: row?.published ?? false });
}
