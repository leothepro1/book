import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tenantId = tenantData.tenant.id;

  const [synced, failed, pending] = await Promise.all([
    prisma.emailMarketingSync.count({ where: { tenantId, appId: "mailchimp", status: "SYNCED" } }),
    prisma.emailMarketingSync.count({ where: { tenantId, appId: "mailchimp", status: "FAILED" } }),
    prisma.emailMarketingSync.count({ where: { tenantId, appId: "mailchimp", status: "PENDING" } }),
  ]);

  // Estimate total from unique guest emails
  const totalEmails = await prisma.booking.findMany({
    where: { tenantId },
    select: { guestEmail: true },
    distinct: ["guestEmail"],
  });

  return NextResponse.json({
    synced,
    failed,
    total: totalEmails.length,
    inProgress: pending > 0 || (synced + failed) < totalEmails.length,
  });
}
