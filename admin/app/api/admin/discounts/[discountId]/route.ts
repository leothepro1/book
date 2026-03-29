export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { log } from "@/app/_lib/logger";

type RouteParams = { params: Promise<{ discountId: string }> };

// ── Immutable fields that cannot be changed after creation ──────

const IMMUTABLE_FIELDS = ["method", "valueType", "value", "targetType", "conditions", "startsAt"] as const;

// ── Patch schema ────────────────────────────────────────────────

const patchDiscountSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  combinesWithProductDiscounts: z.boolean().optional(),
  combinesWithOrderDiscounts: z.boolean().optional(),
  combinesWithShippingDiscounts: z.boolean().optional(),
});

// ── GET — Fetch single discount ─────────────────────────────────

export async function GET(
  _req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { discountId } = await params;
  const tenantId = ctx.tenant.id;

  const discount = await prisma.discount.findUnique({
    where: { id: discountId },
    include: {
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
      _count: { select: { usages: true } },
      events: {
        orderBy: { createdAt: "asc" },
      },
      usages: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          guestEmail: true,
          discountAmount: true,
          createdAt: true,
          orderId: true,
        },
      },
    },
  });

  if (!discount || discount.tenantId !== tenantId) {
    return NextResponse.json({ error: "Rabatten hittades inte" }, { status: 404 });
  }

  return NextResponse.json(discount);
}

// ── PATCH — Update discount ─────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
  const { discountId } = await params;
  const tenantId = ctx.tenant.id;

  // Verify discount exists and belongs to tenant
  const existing = await prisma.discount.findUnique({
    where: { id: discountId },
    select: { id: true, tenantId: true, status: true, title: true },
  });

  if (!existing || existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Rabatten hittades inte" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  // Reject immutable fields
  if (typeof body === "object" && body !== null) {
    for (const field of IMMUTABLE_FIELDS) {
      if (field in body) {
        return NextResponse.json(
          { error: "IMMUTABLE_FIELD", field, message: `Fältet "${field}" kan inte ändras efter skapande` },
          { status: 422 },
        );
      }
    }
  }

  const parsed = patchDiscountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valideringsfel", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // Build update data — only include fields that are present
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;
  if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
  if (input.status !== undefined) data.status = input.status;
  if (input.combinesWithProductDiscounts !== undefined) data.combinesWithProductDiscounts = input.combinesWithProductDiscounts;
  if (input.combinesWithOrderDiscounts !== undefined) data.combinesWithOrderDiscounts = input.combinesWithOrderDiscounts;
  if (input.combinesWithShippingDiscounts !== undefined) data.combinesWithShippingDiscounts = input.combinesWithShippingDiscounts;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
  }

  const discount = await prisma.$transaction(async (tx) => {
    const updated = await tx.discount.update({
      where: { id: discountId },
      data,
      include: {
        codes: {
          select: { id: true, code: true, usageCount: true, usageLimit: true, isActive: true },
        },
        conditions: true,
        _count: { select: { usages: true } },
      },
    });

    // Record status change events
    if (input.status === "DISABLED" && existing.status !== "DISABLED") {
      await tx.discountEvent.create({
        data: {
          discountId,
          tenantId,
          type: "DISABLED",
          message: `Rabatt "${existing.title}" inaktiverad`,
          actorUserId: userId,
        },
      });
    } else if (input.status === "ACTIVE" && existing.status !== "ACTIVE") {
      await tx.discountEvent.create({
        data: {
          discountId,
          tenantId,
          type: "ENABLED",
          message: `Rabatt "${existing.title}" aktiverad`,
          actorUserId: userId,
        },
      });
    } else if (Object.keys(data).length > 0) {
      await tx.discountEvent.create({
        data: {
          discountId,
          tenantId,
          type: "UPDATED",
          message: `Rabatt uppdaterad`,
          actorUserId: userId,
          metadata: { updatedFields: Object.keys(data).join(", ") },
        },
      });
    }

    return updated;
  });

  log("info", "discount.updated", {
    tenantId,
    discountId,
    updatedFields: Object.keys(data).join(", "),
    actorUserId: userId,
  });

  return NextResponse.json(discount);
}

// ── DELETE — Soft-delete or hard-delete ──────────────────────────

export async function DELETE(
  _req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
  const { discountId } = await params;
  const tenantId = ctx.tenant.id;

  const discount = await prisma.discount.findUnique({
    where: { id: discountId },
    select: { id: true, tenantId: true, usageCount: true, title: true },
  });

  if (!discount || discount.tenantId !== tenantId) {
    return NextResponse.json({ error: "Rabatten hittades inte" }, { status: 404 });
  }

  if (discount.usageCount > 0) {
    // Soft-delete — keep for audit
    await prisma.$transaction([
      prisma.discount.update({
        where: { id: discountId },
        data: { status: "DISABLED" },
      }),
      prisma.discountEvent.create({
        data: {
          discountId,
          tenantId,
          type: "DISABLED",
          message: `Rabatt "${discount.title}" inaktiverad (borttagen med ${discount.usageCount} användningar)`,
          actorUserId: userId,
        },
      }),
    ]);

    log("info", "discount.soft_deleted", { tenantId, discountId, usageCount: discount.usageCount });
    return NextResponse.json({ deleted: false, disabled: true });
  }

  // Hard delete — no usages exist
  await prisma.discount.delete({ where: { id: discountId } });

  log("info", "discount.hard_deleted", { tenantId, discountId });
  return new NextResponse(null, { status: 204 });
}
