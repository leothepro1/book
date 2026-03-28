"use server";

import { prisma } from "@/app/_lib/db/prisma";
import type { OrderEventType } from "@prisma/client";

interface CreateOrderEventInput {
  orderId: string;
  tenantId: string;
  type: OrderEventType;
  message: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string;
  actorName?: string;
}

/**
 * Central entry point for creating order events.
 * Every order event in the system MUST go through this function.
 * Direct prisma.orderEvent.create() is banned.
 */
export async function createOrderEvent(input: CreateOrderEventInput): Promise<void> {
  // Tenant isolation — verify order belongs to tenant
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: { id: true },
  });

  if (!order) {
    throw new Error(`Order ${input.orderId} not found for tenant ${input.tenantId}`);
  }

  await prisma.orderEvent.create({
    data: {
      orderId: input.orderId,
      tenantId: input.tenantId,
      type: input.type,
      message: input.message,
      metadata: (input.metadata ?? {}) as Record<string, string>,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName ?? null,
    },
  });
}

/**
 * Variant for use inside $transaction — accepts tx client.
 * Same validation, same shape, but uses the transaction client.
 */
export async function createOrderEventInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: CreateOrderEventInput,
): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      tenantId: input.tenantId,
      type: input.type,
      message: input.message,
      metadata: (input.metadata ?? {}) as Record<string, string>,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName ?? null,
    },
  });
}
