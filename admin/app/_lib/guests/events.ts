"use server";

import { prisma } from "@/app/_lib/db/prisma";
import type { GuestEventType } from "@prisma/client";

interface CreateGuestAccountEventInput {
  guestAccountId: string;
  tenantId: string;
  type: GuestEventType;
  message: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string;
  actorName?: string;
  ipAddress?: string;
  userAgent?: string;
  orderId?: string;
}

/**
 * Central entry point for creating guest account events.
 * Every guest event in the system MUST go through this function.
 * Direct prisma.guestAccountEvent.create() is banned.
 *
 * Includes tenant isolation check — verifies guestAccountId belongs to tenantId.
 * Throws on failure — caller handles try/catch.
 */
export async function createGuestAccountEvent(input: CreateGuestAccountEventInput): Promise<void> {
  // Tenant isolation — verify guest belongs to tenant
  const guest = await prisma.guestAccount.findUnique({
    where: { id: input.guestAccountId },
    select: { tenantId: true },
  });

  if (!guest) {
    throw new Error(`GuestAccount ${input.guestAccountId} not found`);
  }

  if (guest.tenantId !== input.tenantId) {
    throw new Error(
      `Tenant isolation violation: GuestAccount ${input.guestAccountId} ` +
      `belongs to tenant ${guest.tenantId}, not ${input.tenantId}`,
    );
  }

  await prisma.guestAccountEvent.create({
    data: {
      tenantId: input.tenantId,
      guestAccountId: input.guestAccountId,
      type: input.type,
      message: input.message,
      metadata: (input.metadata ?? {}) as Record<string, string>,
      actorUserId: input.actorUserId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      orderId: input.orderId ?? null,
    },
  });
}

/**
 * Variant for use inside $transaction — accepts tx client.
 * No tenant isolation lookup — caller is responsible (already in tx with tenant context).
 *
 * For ORDER_PLACED, ORDER_PAID, ORDER_FULFILLED: uses upsert for idempotency
 * when orderId is provided (prevents duplicates on webhook retry).
 */
export async function createGuestAccountEventInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: CreateGuestAccountEventInput,
): Promise<void> {
  const isOrderEvent = input.orderId && [
    "ORDER_PLACED", "ORDER_PAID", "ORDER_FULFILLED", "ORDER_CANCELLED", "ORDER_REFUNDED",
  ].includes(input.type);

  if (isOrderEvent && input.orderId) {
    // Idempotent upsert — compound unique on [guestAccountId, orderId, type]
    // If already exists: no-op. Prevents duplicates on webhook retry.
    const existing = await tx.guestAccountEvent.findFirst({
      where: {
        guestAccountId: input.guestAccountId,
        orderId: input.orderId,
        type: input.type,
      },
      select: { id: true },
    });

    if (existing) return; // Already recorded — idempotent skip
  }

  await tx.guestAccountEvent.create({
    data: {
      tenantId: input.tenantId,
      guestAccountId: input.guestAccountId,
      type: input.type,
      message: input.message,
      metadata: (input.metadata ?? {}) as Record<string, string>,
      actorUserId: input.actorUserId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      orderId: input.orderId ?? null,
    },
  });
}
