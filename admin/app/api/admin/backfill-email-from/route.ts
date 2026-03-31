/**
 * One-time backfill: set emailFrom for tenants that have a portalSlug
 * but no emailFrom yet.
 * Secured with CRON_SECRET — same pattern as cron endpoints.
 *
 * Usage:
 *   curl -X POST https://rutgr.com/api/admin/backfill-email-from \
 *     -H "x-cron-secret: YOUR_CRON_SECRET"
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { tenantDefaultEmailFrom } from "@/app/_lib/tenant/portal-slug";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      portalSlug: { not: null },
      emailFrom: null,
    },
    select: { id: true, name: true, portalSlug: true },
  });

  const results = [];
  for (const tenant of tenants) {
    const emailFrom = tenantDefaultEmailFrom(tenant.portalSlug!);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { emailFrom },
    });
    results.push({ id: tenant.id, name: tenant.name, emailFrom });
  }

  return NextResponse.json({ backfilled: results.length, emails: results });
}
