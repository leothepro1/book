/**
 * Guest Stats — computed from orders, never denormalized.
 *
 * Shopify's amountSpent and numberOfOrders are always derived.
 * We do the same — single query, no materialized counters.
 */

import { prisma } from "@/app/_lib/db/prisma";

export interface GuestStats {
  totalOrders: number;
  totalSpent: number;         // in ören/cents
  currency: string;           // most common currency for this guest
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  lifetimeDays: number | null;
}

export async function getGuestStats(
  tenantId: string,
  guestAccountId: string,
): Promise<GuestStats> {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      guestAccountId,
      financialStatus: { notIn: ["VOIDED"] },
    },
    select: {
      totalAmount: true,
      currency: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) {
    return {
      totalOrders: 0,
      totalSpent: 0,
      currency: "SEK",
      firstOrderAt: null,
      lastOrderAt: null,
      lifetimeDays: null,
    };
  }

  const totalSpent = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const firstOrderAt = orders[0].paidAt ?? orders[0].createdAt;
  const lastOrderAt = orders[orders.length - 1].paidAt ?? orders[orders.length - 1].createdAt;
  const lifetimeDays = Math.floor((Date.now() - firstOrderAt.getTime()) / (1000 * 60 * 60 * 24));

  // Most common currency
  const currencyCount = orders.reduce((acc, o) => {
    acc[o.currency] = (acc[o.currency] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const currency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0][0];

  return { totalOrders: orders.length, totalSpent, currency, firstOrderAt, lastOrderAt, lifetimeDays };
}
