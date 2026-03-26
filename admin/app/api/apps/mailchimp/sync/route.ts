import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { prisma } from "@/app/_lib/db/prisma";
import { syncAllContacts } from "@/app/_lib/apps/email-marketing/sync";
import { getEmailAdapter } from "@/app/_lib/apps/email-marketing/adapters";
import { log } from "@/app/_lib/logger";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tenantId = tenantData.tenant.id;
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "mailchimp" } },
  });
  if (!tenantApp) return NextResponse.json({ error: "App not installed" }, { status: 400 });

  const settings = (tenantApp.settings as Record<string, Record<string, unknown>>) ?? {};
  const apiKey = (settings["api-key"]?.apiKey as string) ?? "";
  const listId = (settings["list-select"]?.selectedValue as string) ?? "";

  if (!apiKey || !listId) return NextResponse.json({ error: "Missing API key or list" }, { status: 400 });

  // Run sync in background (don't await — return immediately)
  const adapter = getEmailAdapter("mailchimp");
  syncAllContacts(tenantId, "mailchimp", adapter, apiKey, listId, settings["automations"] ?? {}).catch((err) =>
    log("error", "mailchimp.manual_sync_failed", { tenantId, error: String(err) }),
  );

  return NextResponse.json({ started: true });
}
