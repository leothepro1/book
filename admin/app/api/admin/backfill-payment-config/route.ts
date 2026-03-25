export const dynamic = "force-dynamic";

/**
 * One-time backfill: seed PaymentMethodConfig for existing connected tenants.
 * Secured with CRON_SECRET — same pattern as other backfill endpoints.
 *
 * Usage:
 *   curl -X POST https://bedfront.com/api/admin/backfill-payment-config \
 *     -H "x-cron-secret: YOUR_CRON_SECRET"
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { DEFAULT_PAYMENT_METHOD_CONFIG } from "@/app/_lib/payments/defaults";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      stripeOnboardingComplete: true,
      paymentMethodConfig: { equals: Prisma.DbNull },
    },
    select: { id: true, name: true },
  });

  const results = [];
  for (const tenant of tenants) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { paymentMethodConfig: DEFAULT_PAYMENT_METHOD_CONFIG },
    });
    results.push({ id: tenant.id, name: tenant.name });
  }

  return NextResponse.json({
    backfilled: results.length,
    tenants: results,
  });
}
