/**
 * Location-scoped order reads for admin detail views (FAS 4).
 *
 * This is a thin read-only wrapper over the Order model — no order-mutation
 * logic lives here. Order creation, state transitions, and snapshots remain
 * owned by the existing `app/_lib/orders/*` domain.
 *
 * "Unpaid" currently filters on financialStatus = PENDING with a positive
 * balance. A first-class PAYMENT_PENDING/OVERDUE enum value is future work;
 * callers that need overdue highlighting compute it client-side from
 * `paymentDueAt < now` on the returned rows.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { Order } from "@prisma/client";

export type { Order };

export async function listOrdersForLocation(params: {
  tenantId: string;
  locationId: string;
  onlyUnpaid?: boolean;
  cursor?: string;
  take?: number;
}): Promise<{ orders: Order[]; nextCursor: string | null }> {
  const take = Math.min(Math.max(params.take ?? 50, 1), 200);

  const where = {
    tenantId: params.tenantId,
    companyLocationId: params.locationId,
    ...(params.onlyUnpaid
      ? {
          financialStatus: "PENDING" as const,
          balanceAmountCents: { gt: BigInt(0) },
        }
      : {}),
  };

  const rows = await prisma.order.findMany({
    where,
    take: take + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const orders = hasMore ? rows.slice(0, take) : rows;
  return {
    orders,
    nextCursor: hasMore ? orders[orders.length - 1].id : null,
  };
}
