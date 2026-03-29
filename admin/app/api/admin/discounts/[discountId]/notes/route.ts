export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";

type RouteParams = { params: Promise<{ discountId: string }> };

const noteSchema = z.object({
  message: z.string().min(1).max(2000).trim(),
});

export async function POST(
  req: Request,
  { params }: RouteParams,
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await getAuth();
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valideringsfel", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const event = await prisma.discountEvent.create({
    data: {
      discountId,
      tenantId,
      type: "NOTE_ADDED",
      message: parsed.data.message,
      actorUserId: userId,
      actorName: null,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
