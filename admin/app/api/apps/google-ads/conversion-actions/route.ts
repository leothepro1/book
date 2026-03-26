/**
 * Google Ads — Conversion Actions API
 *
 * GET: List conversion actions for the connected Google Ads account
 * POST: Create a new conversion action
 * Auth: requireAdmin() — internal only
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getValidAccessToken } from "@/app/_lib/apps/google-ads/oauth";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";

type ConversionAction = {
  id: string;
  name: string;
  category: string;
};

async function getCustomerId(tenantId: string): Promise<string | null> {
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "google-ads" } },
  });
  if (!tenantApp) return null;

  const settings = tenantApp.settings as Record<string, Record<string, unknown>>;
  const accountData = settings["select-account"];
  return (accountData?.selectedValue as string) ?? null;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tenantId = tenantData.tenant.id;
  const customerId = await getCustomerId(tenantId);
  if (!customerId) return NextResponse.json({ error: "No Google Ads account selected" }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantId);
  } catch {
    return NextResponse.json({ error: "OAuth-token ogiltig" }, { status: 401 });
  }

  try {
    const cleanId = customerId.replace(/-/g, "");
    const query = `SELECT conversion_action.id, conversion_action.name, conversion_action.category FROM conversion_action WHERE conversion_action.status = 'ENABLED'`;

    const res = await fetch(`${GOOGLE_ADS_API}/customers/${cleanId}/googleAds:searchStream`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const text = await res.text();
      log("error", "google-ads.list_conversion_actions_failed", { status: res.status, body: text.slice(0, 200) });
      return NextResponse.json({ actions: [] });
    }

    const data = await res.json();
    const results = Array.isArray(data) ? data[0]?.results ?? [] : data.results ?? [];

    const actions: ConversionAction[] = results.map((r: Record<string, Record<string, string>>) => ({
      id: r.conversionAction?.id ?? "",
      name: r.conversionAction?.name ?? "",
      category: r.conversionAction?.category ?? "PURCHASE",
    }));

    return NextResponse.json({ actions });
  } catch (err) {
    log("error", "google-ads.list_conversion_actions_error", { error: String(err) });
    return NextResponse.json({ actions: [] });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tenantId = tenantData.tenant.id;
  const customerId = await getCustomerId(tenantId);
  if (!customerId) return NextResponse.json({ error: "No Google Ads account selected" }, { status: 400 });

  const body = await req.json();
  const name = body.name as string;
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantId);
  } catch {
    return NextResponse.json({ error: "OAuth-token ogiltig" }, { status: 401 });
  }

  try {
    const cleanId = customerId.replace(/-/g, "");
    const res = await fetch(`${GOOGLE_ADS_API}/customers/${cleanId}/conversionActions:mutate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
      body: JSON.stringify({
        operations: [{
          create: {
            name: name.trim(),
            type: "UPLOAD_CLICKS",
            category: "PURCHASE",
            status: "ENABLED",
          },
        }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      log("error", "google-ads.create_conversion_action_failed", { status: res.status, body: text.slice(0, 200) });
      return NextResponse.json({ error: "Kunde inte skapa konverteringsåtgärd" }, { status: 502 });
    }

    const data = await res.json();
    const resourceName = data.results?.[0]?.resourceName ?? "";
    const actionId = resourceName.split("/").pop() ?? "";

    return NextResponse.json({
      action: { id: actionId, name: name.trim(), category: "PURCHASE" },
    });
  } catch (err) {
    log("error", "google-ads.create_conversion_action_error", { error: String(err) });
    return NextResponse.json({ error: "Fel vid skapande av konverteringsåtgärd" }, { status: 500 });
  }
}
