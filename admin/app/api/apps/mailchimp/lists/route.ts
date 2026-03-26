import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { mailchimpAdapter } from "@/app/_lib/apps/email-marketing/adapters/mailchimp";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId: tenantData.tenant.id, appId: "mailchimp" } },
  });

  const settings = (tenantApp?.settings as Record<string, Record<string, unknown>>) ?? {};
  const apiKey = (settings["api-key"]?.apiKey as string) ?? "";
  if (!apiKey) return NextResponse.json({ lists: [] });

  try {
    const lists = await mailchimpAdapter.getLists(apiKey);
    return NextResponse.json({ lists });
  } catch {
    return NextResponse.json({ lists: [] });
  }
}
