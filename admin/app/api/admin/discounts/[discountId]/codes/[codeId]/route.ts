export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { log } from "@/app/_lib/logger";

type RouteParams = { params: Promise<{ discountId: string; codeId: string }> };

const patchCodeSchema = z.object({
  isActive: z.boolean(),
});

// ── Helpers ─────────────────────────────────────────────────────

async function resolveCode(tenantId: string, discountId: string, codeId: string) {
  const code = await prisma.discountCode.findUnique({
    where: { id: codeId },
    select: {
      id: true,
      discountId: true,
      tenantId: true,
      code: true,
      usageCount: true,
      usageLimit: true,
      isActive: true,
    },
  });

  if (!code || code.tenantId !== tenantId || code.discountId !== discountId) {
    return null;
  }

  return code;
}

// ── PATCH — Toggle code active state ────────────────────────────

export async function PATCH(
  req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
  const { discountId, codeId } = await params;
  const tenantId = ctx.tenant.id;

  const existing = await resolveCode(tenantId, discountId, codeId);
  if (!existing) {
    return NextResponse.json({ error: "Koden hittades inte" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const parsed = patchCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valideringsfel", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { isActive } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    const code = await tx.discountCode.update({
      where: { id: codeId },
      data: { isActive },
      select: {
        id: true,
        code: true,
        usageCount: true,
        usageLimit: true,
        isActive: true,
        createdAt: true,
      },
    });

    await tx.discountEvent.create({
      data: {
        discountId,
        tenantId,
        type: isActive ? "CODE_ADDED" : "CODE_REMOVED",
        message: isActive
          ? `Kod "${existing.code}" aktiverad`
          : `Kod "${existing.code}" inaktiverad`,
        actorUserId: userId,
        metadata: { code: existing.code },
      },
    });

    return code;
  });

  log("info", "discount.code_toggled", {
    tenantId,
    discountId,
    codeId,
    isActive,
    actorUserId: userId,
  });

  return NextResponse.json(updated);
}

// ── DELETE — Deactivate or hard-delete code ─────────────────────

export async function DELETE(
  _req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
  const { discountId, codeId } = await params;
  const tenantId = ctx.tenant.id;

  const code = await resolveCode(tenantId, discountId, codeId);
  if (!code) {
    return NextResponse.json({ error: "Koden hittades inte" }, { status: 404 });
  }

  if (code.usageCount > 0) {
    // Soft-delete — keep for audit
    await prisma.$transaction([
      prisma.discountCode.update({
        where: { id: codeId },
        data: { isActive: false },
      }),
      prisma.discountEvent.create({
        data: {
          discountId,
          tenantId,
          type: "CODE_REMOVED",
          message: `Kod "${code.code}" inaktiverad (${code.usageCount} användningar)`,
          actorUserId: userId,
          metadata: { code: code.code, usageCount: String(code.usageCount) },
        },
      }),
    ]);

    log("info", "discount.code_soft_deleted", { tenantId, discountId, codeId, usageCount: code.usageCount });
    return NextResponse.json({ deleted: false, deactivated: true });
  }

  // Hard delete — no usages
  await prisma.$transaction([
    prisma.discountCode.delete({ where: { id: codeId } }),
    prisma.discountEvent.create({
      data: {
        discountId,
        tenantId,
        type: "CODE_REMOVED",
        message: `Kod "${code.code}" borttagen`,
        actorUserId: userId,
        metadata: { code: code.code },
      },
    }),
  ]);

  log("info", "discount.code_hard_deleted", { tenantId, discountId, codeId });
  return new NextResponse(null, { status: 204 });
}
