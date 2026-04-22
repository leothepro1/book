"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth, requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getGuestStats } from "@/app/_lib/guests/stats";
import type { GuestAccountState } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────

export type CustomerListItem = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  state: GuestAccountState;
  emailMarketingState: string;
  totalOrders: number;
  totalSpent: number;
  currency: string;
  tags: string[];
  city: string | null;
  country: string | null;
  createdAt: string;
};

export type CustomerSortField = "createdAt" | "email" | "name" | "totalOrders";
export type CustomerSortDirection = "asc" | "desc";
export type CustomerTab = "all" | "subscribed" | "unsubscribed";

// ── List customers ─────────────────────────────────────────────

export async function getCustomers(opts?: {
  tab?: CustomerTab;
  page?: number;
  limit?: number;
  sortBy?: CustomerSortField;
  sortDirection?: CustomerSortDirection;
  search?: string;
}): Promise<{ customers: CustomerListItem[]; total: number }> {
  const { orgId } = await getAuth();
  if (!orgId) return { customers: [], total: 0 };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { customers: [], total: 0 };

  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 25;
  const skip = (page - 1) * limit;
  const sortBy = opts?.sortBy ?? "createdAt";
  const sortDirection = opts?.sortDirection ?? "desc";
  const search = opts?.search?.trim();
  const tab = opts?.tab ?? "all";

  // Search conditions
  const searchConditions = search ? {
    OR: [
      { email: { contains: search, mode: "insensitive" as const } },
      { firstName: { contains: search, mode: "insensitive" as const } },
      { lastName: { contains: search, mode: "insensitive" as const } },
      { phone: { contains: search, mode: "insensitive" as const } },
    ],
  } : {};

  // Tab filters
  const tabFilter = tab === "subscribed"
    ? { emailMarketingState: "SUBSCRIBED" as const }
    : tab === "unsubscribed"
      ? { emailMarketingState: "UNSUBSCRIBED" as const }
      : {};

  const where = {
    tenantId: tenant.id,
    ...tabFilter,
    ...searchConditions,
  };

  // Sort mapping
  const orderByMap: Record<CustomerSortField, Record<string, string>> = {
    createdAt: { createdAt: sortDirection },
    email: { email: sortDirection },
    name: { firstName: sortDirection },
    totalOrders: { createdAt: sortDirection }, // fallback — can't sort by count directly
  };

  const [results, total] = await Promise.all([
    prisma.guestAccount.findMany({
      where,
      orderBy: orderByMap[sortBy],
      skip,
      take: limit,
      include: {
        tags: { select: { tag: true } },
        _count: { select: { orders: true } },
        orders: {
          where: { financialStatus: { notIn: ["VOIDED"] } },
          select: { totalAmount: true, currency: true },
        },
      },
    }),
    prisma.guestAccount.count({ where }),
  ]);

  return {
    customers: results.map((g) => {
      const totalSpent = g.orders.reduce((sum, o) => sum + o.totalAmount, 0);
      const currency = g.orders[0]?.currency ?? "SEK";
      return {
        id: g.id,
        email: g.email,
        firstName: g.firstName,
        lastName: g.lastName,
        phone: g.phone,
        state: g.state,
        emailMarketingState: g.emailMarketingState,
        totalOrders: g._count.orders,
        totalSpent,
        currency,
        tags: g.tags.map((t) => t.tag),
        city: g.city,
        country: g.country,
        createdAt: g.createdAt.toISOString(),
      };
    }),
    total,
  };
}

// ── Customer detail ────────────────────────────────────────────

export type CustomerDetail = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  state: GuestAccountState;
  emailMarketingState: string;
  verifiedEmail: boolean;
  address1: string | null;
  address2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  locale: string | null;
  note: string | null;
  tags: string[];
  stats: { totalOrders: number; totalSpent: number; currency: string; firstOrderAt: string | null; lastOrderAt: string | null };
  latestOrder: {
    id: string;
    orderNumber: number;
    status: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalAmount: number;
    subtotalAmount: number;
    taxAmount: number;
    currency: string;
    paidAt: string | null;
    fulfilledAt: string | null;
    cancelledAt: string | null;
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
  } | null;
  events: {
    id: string;
    type: string;
    message: string | null;
    metadata: Record<string, unknown>;
    actorUserId: string | null;
    createdAt: string;
  }[];
  staffProfiles: Record<string, { name: string; imageUrl: string | null }>;
  createdAt: string;
  prevCustomerId: string | null;
  nextCustomerId: string | null;
};

export async function getCustomer(customerId: string): Promise<CustomerDetail | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return null;

  const [account, tags, stats, latestOrderRow, events] = await Promise.all([
    prisma.guestAccount.findFirst({
      where: { id: customerId, tenantId: tenant.id },
    }),
    prisma.guestTag.findMany({
      where: { tenantId: tenant.id, guestAccountId: customerId },
      select: { tag: true },
    }),
    getGuestStats(tenant.id, customerId),
    prisma.order.findFirst({
      where: { tenantId: tenant.id, guestAccountId: customerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, orderNumber: true, status: true, financialStatus: true,
        fulfillmentStatus: true, totalAmount: true, subtotalAmount: true,
        taxAmount: true, currency: true, paidAt: true, fulfilledAt: true,
        cancelledAt: true, createdAt: true, metadata: true,
        lineItems: {
          select: {
            id: true, title: true, variantTitle: true, sku: true,
            imageUrl: true, quantity: true, unitAmount: true,
            totalAmount: true, currency: true,
          },
        },
      },
    }),
    prisma.guestAccountEvent.findMany({
      where: { tenantId: tenant.id, guestAccountId: customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, message: true, metadata: true, actorUserId: true, createdAt: true },
    }),
  ]);

  if (!account) return null;

  // Resolve Clerk staff profiles — batch fetch unique userIds
  const staffProfiles: Record<string, { name: string; imageUrl: string | null }> = {};
  const uniqueUserIds = [...new Set(events.map((e) => e.actorUserId).filter(Boolean))] as string[];

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
      for (const event of events) {
        if (event.actorUserId && !staffProfiles[event.actorUserId]) {
          const metaName = (event.metadata as Record<string, unknown>)?.authorName as string | undefined;
          staffProfiles[event.actorUserId] = { name: metaName ?? "Personal", imageUrl: null };
        }
      }
    }
  }

  // Adjacent customers for prev/next
  const [prev, next] = await Promise.all([
    prisma.guestAccount.findFirst({
      where: { tenantId: tenant.id, createdAt: { lt: account.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.guestAccount.findFirst({
      where: { tenantId: tenant.id, createdAt: { gt: account.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);

  return {
    id: account.id,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    phone: account.phone,
    state: account.state,
    emailMarketingState: account.emailMarketingState,
    verifiedEmail: account.verifiedEmail,
    address1: account.address1,
    address2: account.address2,
    city: account.city,
    postalCode: account.postalCode,
    country: account.country,
    locale: account.locale,
    note: account.note,
    tags: tags.map((t) => t.tag),
    stats: {
      totalOrders: stats.totalOrders,
      totalSpent: stats.totalSpent,
      currency: stats.currency,
      firstOrderAt: stats.firstOrderAt?.toISOString() ?? null,
      lastOrderAt: stats.lastOrderAt?.toISOString() ?? null,
    },
    latestOrder: latestOrderRow ? {
      id: latestOrderRow.id,
      orderNumber: latestOrderRow.orderNumber,
      status: latestOrderRow.status,
      financialStatus: latestOrderRow.financialStatus,
      fulfillmentStatus: latestOrderRow.fulfillmentStatus,
      totalAmount: latestOrderRow.totalAmount,
      subtotalAmount: latestOrderRow.subtotalAmount,
      taxAmount: latestOrderRow.taxAmount,
      currency: latestOrderRow.currency,
      paidAt: latestOrderRow.paidAt?.toISOString() ?? null,
      fulfilledAt: latestOrderRow.fulfilledAt?.toISOString() ?? null,
      cancelledAt: latestOrderRow.cancelledAt?.toISOString() ?? null,
      createdAt: latestOrderRow.createdAt.toISOString(),
      metadata: latestOrderRow.metadata as Record<string, unknown> | null,
      lineItems: latestOrderRow.lineItems.map((li) => ({
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
    } : null,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      metadata: (e.metadata ?? {}) as Record<string, unknown>,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt.toISOString(),
    })),
    staffProfiles,
    createdAt: account.createdAt.toISOString(),
    prevCustomerId: prev?.id ?? null,
    nextCustomerId: next?.id ?? null,
  };
}

// ── Update customer note ──────────────────────────────────────

export async function updateCustomerInternalNote(
  customerId: string,
  note: string,
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

  const account = await prisma.guestAccount.findFirst({
    where: { id: customerId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "Kunden hittades inte" };

  await prisma.guestAccount.update({
    where: { id: customerId },
    data: { note: note.trim() || null },
  });

  return { ok: true };
}

// ── Create customer ───────────────────────────────────────────

export async function createCustomerAction(input: {
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  address1?: string;
  address2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  note?: string;
  tags?: string[];
}): Promise<
  { ok: true; data: { customerId: string } } | { ok: false; error: string }
> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { orgId, userId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  // ── Client-supplied normalisation + hard validation ──
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "E-post krävs" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Ogiltig e-postadress" };
  }

  // ── Duplicate guard — unique(tenantId, email) ──
  const existing = await prisma.guestAccount.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "En kund med samma e-post finns redan" };
  }

  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  // ── Tag normalisation — lowercase, dedup, cap length ──
  const normalizedTags = Array.from(
    new Set(
      (input.tags ?? [])
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 100),
    ),
  );

  try {
    const created = await prisma.$transaction(async (tx) => {
      const account = await tx.guestAccount.create({
        data: {
          tenantId: tenant.id,
          email,
          firstName,
          lastName,
          name: fullName,
          phone: input.phone?.trim() || null,
          address1: input.address1?.trim() || null,
          address2: input.address2?.trim() || null,
          postalCode: input.postalCode?.trim() || null,
          city: input.city?.trim() || null,
          country: input.country?.trim() || "SE",
          note: input.note?.trim() || null,
        },
      });

      if (normalizedTags.length > 0) {
        await tx.guestTag.createMany({
          data: normalizedTags.map((tag) => ({
            tenantId: tenant.id,
            guestAccountId: account.id,
            tag,
            createdBy: userId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return account;
    });

    // Fire-and-forget ACCOUNT_CREATED event — mirrors upsertGuestAccount.
    try {
      const { createGuestAccountEvent } = await import(
        "@/app/_lib/guests/events"
      );
      await createGuestAccountEvent({
        tenantId: tenant.id,
        guestAccountId: created.id,
        type: "ACCOUNT_CREATED",
        message: "Gästkonto skapat manuellt av admin",
        actorUserId: userId ?? undefined,
        metadata: { source: "admin" },
      });
    } catch {
      // Non-blocking — event logging should never fail the create flow.
    }

    revalidatePath("/customers");
    revalidatePath(`/customers/${created.id}`);

    return { ok: true, data: { customerId: created.id } };
  } catch (err) {
    // Defensive — the pre-check handles the happy path but a race could
    // still hit the unique index. Surface a clean message.
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("unique")
    ) {
      return { ok: false, error: "En kund med samma e-post finns redan" };
    }
    return {
      ok: false,
      error: "Kunde inte skapa kunden. Försök igen.",
    };
  }
}

// ── Add customer comment ─────────────────────────────────────

export async function addCustomerComment(
  customerId: string,
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

  const account = await prisma.guestAccount.findFirst({
    where: { id: customerId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "Kunden hittades inte" };

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

  const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
  await createGuestAccountEvent({
    guestAccountId: customerId,
    tenantId: tenant.id,
    type: "COMMENT_ADDED",
    message: trimmed,
    actorUserId: userId ?? undefined,
    metadata: { authorName },
  });

  return { ok: true };
}
