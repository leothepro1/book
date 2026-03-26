import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuthorizationUrl } from "@/app/_lib/apps/meta-ads/oauth";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = getAuthorizationUrl(tenantData.tenant.id);
  return NextResponse.json({ url });
}
