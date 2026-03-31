"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth, requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { adjustInventoryInTx } from "@/app/_lib/products/inventory";
import { canTransition } from "@/app/_lib/orders/types";
import { transitionFulfillmentStatus } from "@/app/_lib/orders/fulfillment";
import { createOrderEvent, createOrderEventInTx } from "@/app/_lib/orders/events";
import type { OrderStatus } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────

export type OrderListItem = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  financialStatus: string;
  fulfillmentStatus: string;
  guestName: string;
  guestEmail: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  lineItemCount: number;
  productTitles: string[];
  lineItems: { title: string; imageUrl: string | null }[];
  sourceChannel: string | null;
  tags: string[];
  recoveryStatus?: "not_contacted" | "contacted";
};

export type OrderDetail = {
  id: string;
  tenantId: string;
  orderNumber: number;
  status: OrderStatus;
  financialStatus: string;
  fulfillmentStatus: string;
  sourceChannel: string | null;
  sourceExternalId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestAccountId: string | null;
  guestOrderCount: number;
  guestAddress: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
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
  orderType: string;
  tags: string[];
  customerNote: string | null;
  archivedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
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
    message: string;
    metadata: Record<string, unknown>;
    actorUserId: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
  payment: {
    status: string;
    amount: number;
    currency: string;
    resolvedAt: string | null;
    providerKey: string;
    externalSessionId: string | null;
  } | null;
  /** Clerk staff profiles keyed by userId — resolved once, used by all events */
  staffProfiles: Record<string, { name: string; imageUrl: string | null }>;
  /** Adjacent order IDs for prev/next navigation */
  prevOrderId: string | null;
  nextOrderId: string | null;
};

// ── List orders ────────────────────────────────────────────────

export type OrderTab = "all" | "unfulfilled" | "unpaid" | "open" | "closed";
export type OrderSortField = "orderNumber" | "createdAt" | "guestName" | "status" | "totalAmount";
export type OrderSortDirection = "asc" | "desc";

function buildTabWhere(tab: OrderTab, tenantId: string) {
  const base = { tenantId };
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  switch (tab) {
    case "all":
      // Exclude stale PENDING orders (> 1h old) — those belong in abandoned checkouts.
      // Recent PENDING orders (< 1h) are active checkouts and should be visible.
      return {
        ...base,
        OR: [
          { financialStatus: { not: "PENDING" as const } },
          { financialStatus: "PENDING" as const, createdAt: { gt: oneHourAgo } },
        ],
      };

    case "unfulfilled":
      // Paid but not yet delivered
      return { ...base, financialStatus: "PAID" as const, fulfillmentStatus: "UNFULFILLED" as const };

    case "unpaid":
      // Active checkouts — PENDING and less than 1h old (not abandoned)
      return { ...base, financialStatus: "PENDING" as const, createdAt: { gt: oneHourAgo } };

    case "open":
      // Not refunded/voided and not cancelled fulfillment
      return {
        ...base,
        financialStatus: { notIn: ["REFUNDED" as const, "VOIDED" as const] },
        fulfillmentStatus: { not: "CANCELLED" as const },
      };

    case "closed":
      // Fulfilled or refunded/voided
      return {
        ...base,
        OR: [
          { fulfillmentStatus: "FULFILLED" as const },
          { financialStatus: { in: ["REFUNDED" as const, "VOIDED" as const] } },
        ],
      };

    default:
      return base;
  }
}

export async function getOrders(opts?: {
  tab?: OrderTab;
  page?: number;
  limit?: number;
  sortBy?: OrderSortField;
  sortDirection?: OrderSortDirection;
  search?: string;
  channel?: string;
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
  const tab = opts?.tab ?? "all";

  // Build search conditions
  const searchConditions = search ? {
    OR: [
      ...((/^\d+$/.test(search) || /^#?\d+$/.test(search))
        ? [{ orderNumber: parseInt(search.replace("#", ""), 10) }]
        : []),
      { guestName: { contains: search, mode: "insensitive" as const } },
      { guestEmail: { contains: search, mode: "insensitive" as const } },
    ],
  } : {};

  const channelFilter = opts?.channel
    ? { sourceChannel: opts.channel }
    : {};

  const where = {
    ...buildTabWhere(tab, tenant.id),
    ...searchConditions,
    ...channelFilter,
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        lineItems: { select: { title: true, imageUrl: true } },
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
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      guestName: o.guestName,
      guestEmail: o.guestEmail,
      totalAmount: o.totalAmount,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      lineItemCount: o.lineItems.length,
      productTitles: o.lineItems.map((li) => li.title),
      lineItems: o.lineItems.map((li) => ({ title: li.title, imageUrl: li.imageUrl })),
      sourceChannel: o.sourceChannel,
      tags: o.tags ? o.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    })),
    total,
  };
}

// ── Abandoned checkouts: CheckoutSessions ─────────────────────

export type AbandonedSession = {
  id: string;
  accommodationName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  accommodationTotal: number;
  addonTotal: number;
  currency: string;
  status: string;
  createdAt: string;
};

export async function getAbandonedSessions(opts?: {
  page?: number;
  limit?: number;
}): Promise<{ sessions: AbandonedSession[]; total: number }> {
  const { orgId } = await getAuth();
  if (!orgId) return { sessions: [], total: 0 };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { sessions: [], total: 0 };

  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 25;

  const where = {
    tenantId: tenant.id,
    status: { in: ["EXPIRED" as const, "ABANDONED" as const] },
  };

  const [sessions, total] = await Promise.all([
    prisma.checkoutSession.findMany({
      where,
      select: {
        id: true,
        accommodationName: true,
        checkIn: true,
        checkOut: true,
        adults: true,
        accommodationTotal: true,
        selectedAddons: true,
        currency: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.checkoutSession.count({ where }),
  ]);

  return {
    sessions: sessions.map((s) => {
      const addons = (s.selectedAddons ?? []) as Array<{ totalAmount?: number }>;
      const addonTotal = addons.reduce((sum, a) => sum + (a.totalAmount ?? 0), 0);
      return {
        id: s.id,
        accommodationName: s.accommodationName,
        checkIn: s.checkIn.toISOString().split("T")[0],
        checkOut: s.checkOut.toISOString().split("T")[0],
        adults: s.adults,
        accommodationTotal: s.accommodationTotal,
        addonTotal,
        currency: s.currency,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      };
    }),
    total,
  };
}

// ── Abandoned checkouts: Stale PENDING Orders ─────────────────

export type AbandonedOrder = {
  id: string;
  orderNumber: number;
  guestName: string;
  guestEmail: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  lineItemTitle: string | null;
  stripePaymentIntentId: string | null;
};

export async function getAbandonedOrders(opts?: {
  page?: number;
  limit?: number;
}): Promise<{ orders: AbandonedOrder[]; total: number }> {
  const { orgId } = await getAuth();
  if (!orgId) return { orders: [], total: 0 };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { orders: [], total: 0 };

  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 25;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const where = {
    tenantId: tenant.id,
    financialStatus: "PENDING" as const,
    createdAt: { lt: oneHourAgo },
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        guestName: true,
        guestEmail: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        stripePaymentIntentId: true,
        lineItems: { select: { title: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      guestName: o.guestName,
      guestEmail: o.guestEmail,
      totalAmount: o.totalAmount,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      lineItemTitle: o.lineItems[0]?.title ?? null,
      stripePaymentIntentId: o.stripePaymentIntentId,
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
      events: {
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, message: true, metadata: true, actorUserId: true, actorName: true, createdAt: true },
      },
      paymentSession: true,
      guestAccount: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          address1: true,
          address2: true,
          city: true,
          postalCode: true,
          country: true,
          _count: { select: { orders: true } },
        },
      },
    },
  });

  if (!order) return null;

  const ga = order.guestAccount;

  // Adjacent orders for prev/next navigation (by orderNumber)
  const [prevOrder, nextOrder] = await Promise.all([
    prisma.order.findFirst({
      where: { tenantId: tenant.id, orderNumber: { lt: order.orderNumber } },
      orderBy: { orderNumber: "desc" },
      select: { id: true },
    }),
    prisma.order.findFirst({
      where: { tenantId: tenant.id, orderNumber: { gt: order.orderNumber } },
      orderBy: { orderNumber: "asc" },
      select: { id: true },
    }),
  ]);

  // Resolve Clerk staff profiles — batch fetch unique userIds
  const staffProfiles: Record<string, { name: string; imageUrl: string | null }> = {};
  const uniqueUserIds = [...new Set(order.events.map((e) => e.actorUserId).filter(Boolean))] as string[];

  if (uniqueUserIds.length > 0) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const users = await client.users.getUserList({ userId: uniqueUserIds, limit: uniqueUserIds.length });
      for (const user of users.data) {
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.emailAddresses[0]?.emailAddress || "Personal";
        staffProfiles[user.id] = { name, imageUrl: user.imageUrl ?? null };
      }
    } catch {
      // Dev mode or Clerk unavailable — use metadata fallback
      for (const event of order.events) {
        if (event.actorUserId && !staffProfiles[event.actorUserId]) {
          const metaName = (event.metadata as Record<string, unknown>)?.authorName as string | undefined;
          staffProfiles[event.actorUserId] = { name: metaName ?? "Personal", imageUrl: null };
        }
      }
    }
  }

  return {
    id: order.id,
    tenantId: order.tenantId,
    orderNumber: order.orderNumber,
    status: order.status,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    sourceChannel: order.sourceChannel,
    sourceExternalId: order.sourceExternalId,
    guestName: order.guestName,
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    guestAccountId: ga?.id ?? null,
    guestOrderCount: ga?._count.orders ?? 0,
    guestAddress: ga ? {
      firstName: ga.firstName,
      lastName: ga.lastName,
      company: null,
      address1: ga.address1,
      address2: ga.address2,
      city: ga.city,
      postalCode: ga.postalCode,
      country: ga.country,
    } : null,
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
    orderType: order.orderType,
    tags: order.tags ? order.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    customerNote: order.customerNote ?? null,
    archivedAt: order.archivedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    metadata: (order.metadata as Record<string, unknown>) ?? null,
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
      metadata: (e.metadata as Record<string, unknown>) ?? {},
      actorUserId: e.actorUserId,
      actorName: e.actorName ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    payment: order.paymentSession ? {
      status: order.paymentSession.status,
      amount: order.paymentSession.amount,
      currency: order.paymentSession.currency,
      resolvedAt: order.paymentSession.resolvedAt?.toISOString() ?? null,
      providerKey: order.paymentSession.providerKey,
      externalSessionId: order.paymentSession.externalSessionId ?? null,
    } : null,
    staffProfiles,
    prevOrderId: prevOrder?.id ?? null,
    nextOrderId: nextOrder?.id ?? null,
  };
}

// ── Update customer note ──────────────────────────────────────

export async function updateCustomerNote(
  orderId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const trimmed = note.trim();
  if (trimmed.length > 1000) return { ok: false, error: "Anteckningen är för lång (max 1000 tecken)" };

  const { orgId, userId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!order) return { ok: false, error: "Ordern hittades inte" };

  let actorName = "Personal";
  if (userId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      actorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Personal";
    } catch { /* dev mode */ }
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { customerNote: trimmed || null },
  });

  await createOrderEvent({
    orderId,
    tenantId: tenant.id,
    type: "ORDER_UPDATED",
    message: "Anteckning tillagd i den här ordern.",
    actorUserId: userId ?? undefined,
    actorName,
  });

  return { ok: true };
}

// ── Add comment ───────────────────────────────────────────────

export async function addOrderComment(
  orderId: string,
  comment: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const trimmed = comment.trim();
  if (!trimmed) return { ok: false, error: "Kommentaren kan inte vara tom" };
  if (trimmed.length > 2000) return { ok: false, error: "Kommentaren är för lång (max 2000 tecken)" };

  const { orgId, userId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!order) return { ok: false, error: "Ordern hittades inte" };

  // Resolve user display name from Clerk
  let authorName = "Personal";
  if (userId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      authorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.emailAddresses[0]?.emailAddress || "Personal";
    } catch {
      // Dev mode or Clerk unavailable — fall back
    }
  }

  await createOrderEvent({
    orderId,
    tenantId: tenant.id,
    type: "NOTE_ADDED",
    message: trimmed,
    actorUserId: userId ?? undefined,
    actorName: authorName,
  });

  return { ok: true };
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

  // Resolve actor name
  let actorName = "Personal";
  if (userId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      actorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Personal";
    } catch { /* dev mode */ }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "FULFILLED", fulfilledAt: new Date() },
    });

    await createOrderEventInTx(tx, {
      orderId,
      tenantId: tenant.id,
      type: "ORDER_FULFILLED",
      message: "Order markerad som levererad",
      actorUserId: userId ?? undefined,
      actorName,
    });
  });

  // Parallel fulfillmentStatus transition (new dimension)
  await transitionFulfillmentStatus(orderId, tenant.id, "FULFILLED", {
    actorUserId: userId ?? undefined,
    note: "Manuellt markerad som slutförd av admin",
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

  // Resolve actor name
  let actorName = "Personal";
  if (userId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      actorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Personal";
    } catch { /* dev mode */ }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await createOrderEventInTx(tx, {
      orderId,
      tenantId: tenant.id,
      type: "ORDER_CANCELLED",
      message: `Order avbokad av ${actorName}`,
      actorUserId: userId ?? undefined,
      actorName,
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

      await createOrderEventInTx(tx, {
        orderId,
        tenantId: tenant.id,
        type: "INVENTORY_RELEASED",
        message: "Lagerreservationer frigivna",
      });
    }
  });

  return { ok: true };
}

// ── Update order tags ─────────────────────────────────────────

export async function updateOrderTags(
  orderId: string,
  tags: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { orgId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!order) return { ok: false, error: "Ordern hittades inte" };

  const normalized = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(normalized)];

  await prisma.order.update({
    where: { id: orderId },
    data: { tags: unique.join(",") },
  });

  return { ok: true };
}

// ── Archive order ─────────────────────────────────────────────

export async function archiveOrder(
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
    select: { id: true, archivedAt: true },
  });
  if (!order) return { ok: false, error: "Ordern hittades inte" };
  if (order.archivedAt) return { ok: false, error: "Ordern är redan arkiverad" };

  let actorName = "Personal";
  if (userId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      actorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Personal";
    } catch { /* dev mode */ }
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { archivedAt: new Date() },
  });

  await createOrderEvent({
    orderId,
    tenantId: tenant.id,
    type: "ORDER_UPDATED",
    message: `Order arkiverad av ${actorName}`,
    actorUserId: userId ?? undefined,
    actorName,
  });

  return { ok: true };
}

// ── Unarchive order ───────────────────────────────────────────

export async function unarchiveOrder(
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
    select: { id: true, archivedAt: true },
  });
  if (!order) return { ok: false, error: "Ordern hittades inte" };
  if (!order.archivedAt) return { ok: false, error: "Ordern är inte arkiverad" };

  let actorName = "Personal";
  if (userId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      actorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Personal";
    } catch { /* dev mode */ }
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { archivedAt: null },
  });

  await createOrderEvent({
    orderId,
    tenantId: tenant.id,
    type: "ORDER_UPDATED",
    message: `Order avarkiverad av ${actorName}`,
    actorUserId: userId ?? undefined,
    actorName,
  });

  return { ok: true };
}

// ── Delete order ──────────────────────────────────────────────

export async function deleteOrder(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { orgId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!order) return { ok: false, error: "Ordern hittades inte" };

  if (order.status !== "CANCELLED") {
    return { ok: false, error: "Endast annulerade ordrar kan tas bort. Annulera ordern först." };
  }

  await prisma.order.delete({ where: { id: orderId } });

  return { ok: true };
}
