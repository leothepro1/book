/**
 * One-time backfill: generate portalSlug for existing tenants.
 * Secured with CRON_SECRET — same pattern as cron endpoints.
 *
 * Usage:
 *   curl -X POST https://bedfront.com/api/admin/backfill-portal-slugs \
 *     -H "x-cron-secret: YOUR_CRON_SECRET"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { generatePortalSlug } from "@/app/_lib/tenant/portal-slug";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { portalSlug: null },
    select: { id: true, name: true },
  });

  const results = [];
  for (const tenant of tenants) {
    const portalSlug = await generatePortalSlug(tenant.name);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { portalSlug },
    });
    results.push({ id: tenant.id, name: tenant.name, portalSlug });
  }

  return NextResponse.json({ backfilled: results.length, slugs: results });
}
