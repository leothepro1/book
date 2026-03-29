export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { createDiscountInput } from "@/app/_lib/discounts/types";
import { normalizeCode } from "@/app/_lib/discounts/codes";
import { log } from "@/app/_lib/logger";
import type { Prisma } from "@prisma/client";

// ── Shared include shape for discount responses ─────────────────

const discountInclude = {
  codes: {
    select: {
      id: true,
      code: true,
      usageCount: true,
      usageLimit: true,
      isActive: true,
    },
  },
  conditions: true,
  targetedProducts: { include: { product: { select: { id: true, title: true } } } },
  targetedCollections: { include: { collection: { select: { id: true, title: true } } } },
  targetedSegments: { include: { segment: { select: { id: true, name: true } } } },
  targetedCustomers: { include: { guestAccount: { select: { id: true, email: true, name: true } } } },
  _count: { select: { usages: true } },
} satisfies Prisma.DiscountInclude;

// ── GET — List discounts ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = ctx.tenant.id;
  const { searchParams } = req.nextUrl;

  const status = searchParams.get("status") as string | null;
  const method = searchParams.get("method") as string | null;
  const q = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.DiscountWhereInput = { tenantId };

  if (status && ["ACTIVE", "SCHEDULED", "EXPIRED", "DISABLED"].includes(status)) {
    where.status = status as Prisma.DiscountWhereInput["status"];
  }
  if (method && ["AUTOMATIC", "CODE"].includes(method)) {
    where.method = method as Prisma.DiscountWhereInput["method"];
  }
  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  const [discounts, total] = await Promise.all([
    prisma.discount.findMany({
      where,
      include: discountInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.discount.count({ where }),
  ]);

  return NextResponse.json({
    discounts,
    total,
    page,
    pageSize: limit,
  });
}

// ── POST — Create discount ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
  const tenantId = ctx.tenant.id;

  if (!ctx.tenant.discountsEnabled) {
    return NextResponse.json(
      { error: "DISCOUNTS_DISABLED", message: "Rabatter är inte aktiverade för detta konto." },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const parsed = createDiscountInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valideringsfel", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const now = new Date();

  // Determine initial status
  const initialStatus = input.startsAt && input.startsAt > now ? "SCHEDULED" : "ACTIVE";

  // Normalize and check codes for conflicts
  let normalizedCodes: string[] = [];
  if (input.method === "CODE" && input.codes) {
    normalizedCodes = input.codes.map(normalizeCode);

    // Check for duplicates within the submitted codes
    const uniqueCodes = new Set(normalizedCodes);
    if (uniqueCodes.size !== normalizedCodes.length) {
      return NextResponse.json(
        { error: "DUPLICATE_CODES", message: "Dubbletter bland inskickade koder" },
        { status: 400 },
      );
    }

    // Check for existing codes in this tenant
    const existing = await prisma.discountCode.findFirst({
      where: { tenantId, code: { in: normalizedCodes } },
      select: { code: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "CODE_ALREADY_EXISTS", code: existing.code },
        { status: 409 },
      );
    }
  }

  // Create discount + conditions + codes + targeting in one transaction
  let discount;
  try {
    discount = await prisma.$transaction(async (tx) => {
      const created = await tx.discount.create({
        data: {
          tenantId,
          title: input.title,
          description: input.description ?? null,
          method: input.method,
          valueType: input.valueType,
          value: input.value,
          targetType: input.targetType,
          appliesToAllProducts: input.appliesToAllProducts,
          appliesToAllCustomers: input.appliesToAllCustomers,
          minimumAmount: input.minimumAmount ?? null,
          minimumQuantity: input.minimumQuantity ?? null,
          status: initialStatus,
          startsAt: input.startsAt ?? now,
          endsAt: input.endsAt ?? null,
          usageLimit: input.usageLimit ?? null,
          combinesWithProductDiscounts: input.combinesWithProductDiscounts,
          combinesWithOrderDiscounts: input.combinesWithOrderDiscounts,
          combinesWithShippingDiscounts: input.combinesWithShippingDiscounts,
          createdByUserId: userId,
        },
      });

      // Create conditions
      if (input.conditions.length > 0) {
        await tx.discountCondition.createMany({
          data: input.conditions.map((c) => ({
            discountId: created.id,
            type: c.type,
            intValue: c.intValue ?? null,
            stringValue: c.stringValue ?? null,
            jsonValue: c.jsonValue !== undefined ? (c.jsonValue as Prisma.InputJsonValue) : undefined,
          })),
        });
      }

      // Create codes
      if (normalizedCodes.length > 0) {
        await tx.discountCode.createMany({
          data: normalizedCodes.map((code) => ({
            discountId: created.id,
            tenantId,
            code,
          })),
        });
      }

      // Persist product targeting
      if (!input.appliesToAllProducts && input.targetedProductIds.length > 0) {
        const validProducts = await tx.product.findMany({
          where: { id: { in: input.targetedProductIds }, tenantId },
          select: { id: true },
        });
        if (validProducts.length !== input.targetedProductIds.length) {
          throw new Error("INVALID_PRODUCT_IDS");
        }
        await tx.discountProduct.createMany({
          data: validProducts.map((p) => ({ discountId: created.id, productId: p.id, tenantId })),
        });
      }

      // Persist collection targeting
      if (!input.appliesToAllProducts && input.targetedCollectionIds.length > 0) {
        const validCollections = await tx.productCollection.findMany({
          where: { id: { in: input.targetedCollectionIds }, tenantId },
          select: { id: true },
        });
        if (validCollections.length !== input.targetedCollectionIds.length) {
          throw new Error("INVALID_COLLECTION_IDS");
        }
        await tx.discountCollection.createMany({
          data: validCollections.map((c) => ({ discountId: created.id, collectionId: c.id, tenantId })),
        });
      }

      // Persist segment targeting
      if (!input.appliesToAllCustomers && input.targetedSegmentIds.length > 0) {
        const validSegments = await tx.guestSegment.findMany({
          where: { id: { in: input.targetedSegmentIds }, tenantId },
          select: { id: true },
        });
        if (validSegments.length !== input.targetedSegmentIds.length) {
          throw new Error("INVALID_SEGMENT_IDS");
        }
        await tx.discountSegment.createMany({
          data: validSegments.map((s) => ({ discountId: created.id, segmentId: s.id, tenantId })),
        });
      }

      // Persist customer targeting
      if (!input.appliesToAllCustomers && input.targetedGuestAccountIds.length > 0) {
        const validGuests = await tx.guestAccount.findMany({
          where: { id: { in: input.targetedGuestAccountIds }, tenantId },
          select: { id: true },
        });
        if (validGuests.length !== input.targetedGuestAccountIds.length) {
          throw new Error("INVALID_CUSTOMER_IDS");
        }
        await tx.discountCustomer.createMany({
          data: validGuests.map((g) => ({ discountId: created.id, guestAccountId: g.id, tenantId })),
        });
      }

      // Audit event
      await tx.discountEvent.create({
        data: {
          discountId: created.id,
          tenantId,
          type: "CREATED",
          message: `Rabatt "${input.title}" skapad`,
          actorUserId: userId,
          metadata: {
            method: input.method,
            valueType: input.valueType,
            value: String(input.value),
            codeCount: String(normalizedCodes.length),
          },
        },
      });

      // Return with full relations
      return tx.discount.findUniqueOrThrow({
        where: { id: created.id },
        include: discountInclude,
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "INVALID_PRODUCT_IDS") {
        return NextResponse.json({ error: "INVALID_PRODUCT_IDS", message: "En eller flera produkt-ID:n är ogiltiga" }, { status: 422 });
      }
      if (err.message === "INVALID_COLLECTION_IDS") {
        return NextResponse.json({ error: "INVALID_COLLECTION_IDS", message: "En eller flera produktserie-ID:n är ogiltiga" }, { status: 422 });
      }
      if (err.message === "INVALID_SEGMENT_IDS") {
        return NextResponse.json({ error: "INVALID_SEGMENT_IDS", message: "En eller flera segment-ID:n är ogiltiga" }, { status: 422 });
      }
      if (err.message === "INVALID_CUSTOMER_IDS") {
        return NextResponse.json({ error: "INVALID_CUSTOMER_IDS", message: "En eller flera kund-ID:n är ogiltiga" }, { status: 422 });
      }
    }
    throw err;
  }

  log("info", "discount.created", {
    tenantId,
    discountId: discount.id,
    method: input.method,
    actorUserId: userId,
  });

  return NextResponse.json(discount, { status: 201 });
}
