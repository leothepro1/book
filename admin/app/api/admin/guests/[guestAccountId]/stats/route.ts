export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getGuestStats } from "@/app/_lib/guests/stats";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guestAccountId: string }> },
) {
  const ctx = await getCurrentTenant();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { guestAccountId } = await params;
  const stats = await getGuestStats(ctx.tenant.id, guestAccountId);

  return NextResponse.json(stats);
}
