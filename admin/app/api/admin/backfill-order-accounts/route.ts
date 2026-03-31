export const dynamic = "force-dynamic";

/**
 * One-time backfill: link existing paid orders to guest accounts.
 * Creates GuestAccount if needed, then sets order.guestAccountId.
 *
 * Usage:
 *   curl -X POST https://rutgr.com/api/admin/backfill-order-accounts \
 *     -H "x-cron-secret: YOUR_CRON_SECRET"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find paid/fulfilled orders without a guest account link
  const orders = await prisma.order.findMany({
    where: {
      guestAccountId: null,
      guestEmail: { not: "" },
      status: { in: ["PAID", "FULFILLED"] },
    },
    select: { id: true, tenantId: true, guestEmail: true, guestName: true, guestPhone: true },
  });

  let linked = 0;
  let created = 0;

  for (const order of orders) {
    const email = order.guestEmail.trim().toLowerCase();
    if (!email) continue;

    try {
      const account = await prisma.guestAccount.upsert({
        where: { tenantId_email: { tenantId: order.tenantId, email } },
        create: {
          tenantId: order.tenantId,
          email,
          name: order.guestName || null,
          phone: order.guestPhone || null,
        },
        update: {},
      });

      if (account.createdAt.getTime() > Date.now() - 5000) created++;

      await prisma.order.update({
        where: { id: order.id },
        data: { guestAccountId: account.id },
      });

      linked++;
    } catch (err) {
      console.error(`[backfill] Failed for order ${order.id}:`, err);
    }
  }

  return NextResponse.json({
    processed: orders.length,
    linked,
    accountsCreated: created,
  });
}
