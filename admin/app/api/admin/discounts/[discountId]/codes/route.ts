export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { normalizeCode } from "@/app/_lib/discounts/codes";
import { log } from "@/app/_lib/logger";

type RouteParams = { params: Promise<{ discountId: string }> };

const addCodesSchema = z.object({
  codes: z.array(z.string().min(1).max(64)).min(1, "Minst en kod krävs"),
});

// ── GET — List codes for a discount ─────────────────────────────

export async function GET(
  _req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { discountId } = await params;
  const tenantId = ctx.tenant.id;

  // Verify discount belongs to tenant
  const discount = await prisma.discount.findUnique({
    where: { id: discountId },
    select: { id: true, tenantId: true },
  });

  if (!discount || discount.tenantId !== tenantId) {
    return NextResponse.json({ error: "Rabatten hittades inte" }, { status: 404 });
  }

  const codes = await prisma.discountCode.findMany({
    where: { discountId, tenantId },
    select: {
      id: true,
      code: true,
      usageCount: true,
      usageLimit: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(codes);
}

// ── POST — Add codes to a discount ──────────────────────────────

export async function POST(
  req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
  const { discountId } = await params;
  const tenantId = ctx.tenant.id;

  // Verify discount belongs to tenant and is a CODE discount
  const discount = await prisma.discount.findUnique({
    where: { id: discountId },
    select: { id: true, tenantId: true, method: true, title: true },
  });

  if (!discount || discount.tenantId !== tenantId) {
    return NextResponse.json({ error: "Rabatten hittades inte" }, { status: 404 });
  }

  if (discount.method !== "CODE") {
    return NextResponse.json(
      { error: "INVALID_METHOD", message: "Koder kan bara läggas till på CODE-rabatter" },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const parsed = addCodesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valideringsfel", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const normalizedCodes = parsed.data.codes.map(normalizeCode);

  // Check for duplicates within submitted codes
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

  // Create codes + audit event in transaction
  const codes = await prisma.$transaction(async (tx) => {
    await tx.discountCode.createMany({
      data: normalizedCodes.map((code) => ({
        discountId,
        tenantId,
        code,
      })),
    });

    await tx.discountEvent.create({
      data: {
        discountId,
        tenantId,
        type: "CODE_ADDED",
        message: `${normalizedCodes.length} kod(er) tillagda`,
        actorUserId: userId,
        metadata: { codes: normalizedCodes.join(", ") },
      },
    });

    return tx.discountCode.findMany({
      where: { discountId, tenantId, code: { in: normalizedCodes } },
      select: {
        id: true,
        code: true,
        usageCount: true,
        usageLimit: true,
        isActive: true,
        createdAt: true,
      },
    });
  });

  log("info", "discount.codes_added", {
    tenantId,
    discountId,
    codeCount: normalizedCodes.length,
    actorUserId: userId,
  });

  return NextResponse.json(codes, { status: 201 });
}
