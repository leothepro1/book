/**
 * GET /api/orders/status/[token]
 *
 * Public order status lookup — no auth required.
 * Uses statusToken (not internal ID) for security.
 * Returns only safe public fields.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { statusToken: token },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      currency: true,
      totalAmount: true,
      lineItems: {
        select: {
          title: true,
          variantTitle: true,
          quantity: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    currency: order.currency,
    totalAmount: order.totalAmount,
    lineItems: order.lineItems.map((li) => ({
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
    })),
  });
}
