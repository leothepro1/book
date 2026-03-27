/**
 * Guest Queries — all read operations for the admin customer view.
 *
 * Never expose raw Prisma in route handlers — always go through this file.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getGuestStats, type GuestStats } from "./stats";
import type {
  GuestAccount,
  GuestNote,
  GuestAccountEvent,
  GuestAddress,
  GuestAccountState,
  GuestMarketingState,
} from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

export type GuestOrderSummary = {
  id: string;
  orderNumber: number;
  status: string;
  financialStatus: string;
  fulfillmentStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  sourceChannel: string | null;
};

export type GuestAccountFull = GuestAccount & {
  tags: string[];
  notes: GuestNote[];
  stats: GuestStats;
  recentEvents: GuestAccountEvent[];
  addresses: GuestAddress[];
  orders: GuestOrderSummary[];
};

export type GuestAccountSummary = GuestAccount & {
  tags: string[];
  totalOrders: number;
};

// ── Full detail ──────────────────────────────────────────────

export async function getGuestAccountFull(
  tenantId: string,
  guestAccountId: string,
): Promise<GuestAccountFull | null> {
  const [account, tags, stats, recentEvents, orders] = await Promise.all([
    prisma.guestAccount.findFirst({
      where: { id: guestAccountId, tenantId },
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        addresses: true,
      },
    }),
    prisma.guestTag.findMany({
      where: { tenantId, guestAccountId },
      orderBy: { createdAt: "asc" },
      select: { tag: true },
    }),
    getGuestStats(tenantId, guestAccountId),
    prisma.guestAccountEvent.findMany({
      where: { tenantId, guestAccountId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.order.findMany({
      where: { tenantId, guestAccountId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        financialStatus: true,
        fulfillmentStatus: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        sourceChannel: true,
      },
    }),
  ]);

  if (!account) return null;

  return {
    ...account,
    tags: tags.map((t) => t.tag),
    stats,
    recentEvents,
    orders,
  };
}

// ── List with filters ────────────────────────────────────────

export async function listGuestAccounts(
  tenantId: string,
  options: {
    search?: string;
    state?: GuestAccountState;
    tag?: string;
    marketingState?: GuestMarketingState;
    orderBy?: "createdAt" | "email" | "name";
    order?: "asc" | "desc";
    take?: number;
    cursor?: string;
  } = {},
): Promise<{ guests: GuestAccountSummary[]; nextCursor: string | null; total: number }> {
  const take = Math.min(options.take ?? 50, 100);
  const orderField = options.orderBy ?? "createdAt";
  const orderDir = options.order ?? "desc";
  const search = options.search?.trim();

  // Build where clause
  const where: Record<string, unknown> = { tenantId };

  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ];
  }
  if (options.state) where.state = options.state;
  if (options.tag) where.tags = { some: { tag: options.tag } };
  if (options.marketingState) where.emailMarketingState = options.marketingState;

  const orderByMap: Record<string, Record<string, string>> = {
    createdAt: { createdAt: orderDir },
    email: { email: orderDir },
    name: { firstName: orderDir },
  };

  const [results, total] = await Promise.all([
    prisma.guestAccount.findMany({
      where,
      orderBy: orderByMap[orderField],
      take: take + 1,
      ...(options.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
      include: {
        tags: { select: { tag: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.guestAccount.count({ where }),
  ]);

  const hasMore = results.length > take;
  const guests = results.slice(0, take);
  const nextCursor = hasMore ? guests[guests.length - 1].id : null;

  return {
    guests: guests.map((g) => {
      const { tags: tagRows, _count, ...rest } = g;
      return {
        ...rest,
        tags: tagRows.map((t) => t.tag),
        totalOrders: _count.orders,
      };
    }),
    nextCursor,
    total,
  };
}
