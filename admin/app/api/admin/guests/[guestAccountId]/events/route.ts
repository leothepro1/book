export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guestAccountId: string }> },
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { guestAccountId } = await params;

  const events = await prisma.guestAccountEvent.findMany({
    where: { tenantId: ctx.tenant.id, guestAccountId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(events);
}
