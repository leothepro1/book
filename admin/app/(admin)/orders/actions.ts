"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth, requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { adjustInventoryInTx } from "@/app/_lib/products/inventory";
import { canTransition } from "@/app/_lib/orders/types";
import type { OrderStatus } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────

export type OrderListItem = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  guestName: string;
  guestEmail: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  lineItemCount: number;
  productTitles: string[];
};

export type OrderDetail = {
  id: string;
  tenantId: string;
  orderNumber: number;
  status: OrderStatus;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  lineItems: {
    id: string;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
    currency: string;
  }[];
  events: {
    id: string;
    type: string;
    message: string | null;
    actorUserId: string | null;
    createdAt: string;
  }[];
};

// ── List orders ────────────────────────────────────────────────

export type OrderSortField = "orderNumber" | "createdAt" | "guestName" | "status" | "totalAmount";
export type OrderSortDirection = "asc" | "desc";

export async function getOrders(opts?: {
  status?: OrderStatus;
  page?: number;
  limit?: number;
  sortBy?: OrderSortField;
  sortDirection?: OrderSortDirection;
  search?: string;
}): Promise<{ orders: OrderListItem[]; total: number }> {
  const { orgId } = await getAuth();
  if (!orgId) return { orders: [], total: 0 };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { orders: [], total: 0 };

  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 25;
  const skip = (page - 1) * limit;
  const sortBy = opts?.sortBy ?? "createdAt";
  const sortDirection = opts?.sortDirection ?? "desc";
  const search = opts?.search?.trim();

  // Build search conditions
  const searchConditions = search ? {
    OR: [
      // Order number — try numeric match
      ...((/^\d+$/.test(search) || /^#?\d+$/.test(search))
        ? [{ orderNumber: parseInt(search.replace("#", ""), 10) }]
        : []),
      // Guest name — case-insensitive contains
      { guestName: { contains: search, mode: "insensitive" as const } },
      // Guest email — case-insensitive contains
      { guestEmail: { contains: search, mode: "insensitive" as const } },
    ],
  } : {};

  const where = {
    tenantId: tenant.id,
    ...(opts?.status ? { status: opts.status } : {}),
    ...searchConditions,
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        lineItems: { select: { title: true } },
      },
      orderBy: { [sortBy]: sortDirection },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      guestName: o.guestName,
      guestEmail: o.guestEmail,
      totalAmount: o.totalAmount,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      lineItemCount: o.lineItems.length,
      productTitles: o.lineItems.map((li) => li.title),
    })),
    total,
  };
}

// ── Get single order ───────────────────────────────────────────

export async function getOrder(orderId: string): Promise<OrderDetail | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return null;

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    include: {
      lineItems: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    tenantId: order.tenantId,
    orderNumber: order.orderNumber,
    status: order.status,
    guestName: order.guestName,
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    subtotalAmount: order.subtotalAmount,
    taxAmount: order.taxAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    stripeCheckoutSessionId: order.stripeCheckoutSessionId,
    stripePaymentIntentId: order.stripePaymentIntentId,
    paidAt: order.paidAt?.toISOString() ?? null,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    lineItems: order.lineItems.map((li) => ({
      id: li.id,
      title: li.title,
      variantTitle: li.variantTitle,
      sku: li.sku,
      imageUrl: li.imageUrl,
      quantity: li.quantity,
      unitAmount: li.unitAmount,
      totalAmount: li.totalAmount,
      currency: li.currency,
    })),
    events: order.events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

// ── Fulfill order ──────────────────────────────────────────────

export async function fulfillOrder(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { orgId, userId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
  });

  if (!order) return { ok: false, error: "Ordern hittades inte" };
  if (!canTransition(order.status, "FULFILLED")) {
    return { ok: false, error: `Ordern kan inte levereras (status: ${order.status})` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "FULFILLED", fulfilledAt: new Date() },
    });

    await tx.orderEvent.create({
      data: {
        orderId,
        type: "FULFILLED",
        message: "Order markerad som levererad",
        actorUserId: userId,
      },
    });
  });

  return { ok: true };
}

// ── Cancel order ───────────────────────────────────────────────

export async function cancelOrder(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { orgId, userId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
  });

  if (!order) return { ok: false, error: "Ordern hittades inte" };
  if (!canTransition(order.status, "CANCELLED")) {
    return { ok: false, error: `Ordern kan inte avbokas (status: ${order.status})` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await tx.orderEvent.create({
      data: {
        orderId,
        type: "CANCELLED",
        message: "Order avbokad av admin",
        actorUserId: userId,
      },
    });

    // Release inventory reservations
    const reservations = await tx.inventoryReservation.findMany({
      where: { sessionId: orderId, consumed: false },
    });

    if (reservations.length > 0) {
      await tx.inventoryReservation.updateMany({
        where: { sessionId: orderId, consumed: false },
        data: { consumed: true },
      });

      // Restore stock through adjustInventoryInTx — proper ledger entries
      for (const res of reservations) {
        await adjustInventoryInTx(tx, {
          tenantId: tenant.id,
          productId: res.productId,
          variantId: res.variantId,
          quantityDelta: res.quantity,
          reason: "RESERVATION_RELEASED",
          note: `Order #${order.orderNumber} avbokad av admin`,
          referenceId: orderId,
        });
      }

      await tx.orderEvent.create({
        data: {
          orderId,
          type: "INVENTORY_RELEASED",
          message: "Lagerreservationer frigivna",
          actorUserId: userId,
        },
      });
    }
  });

  return { ok: true };
}
