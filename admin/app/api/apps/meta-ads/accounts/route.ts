/**
 * Meta Ads — List Ad Accounts
 *
 * GET /api/apps/meta-ads/accounts
 *
 * Returns Meta ad accounts the authenticated user can access.
 * Used as the fetchEndpoint for the account_select wizard step.
 * Auth: requireAdmin() — internal only, no INTERNAL_API_SECRET.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getValidAccessToken } from "@/app/_lib/apps/meta-ads/oauth";
import { log } from "@/app/_lib/logger";

const META_GRAPH = "https://graph.facebook.com/v19.0";

type AdAccountInfo = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantData.tenant.id);
  } catch (err) {
    log("error", "meta-ads.accounts_token_failed", { error: String(err) });
    return NextResponse.json(
      { error: "Meta-token ogiltig — återanslut Meta-kontot" },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(
      `${META_GRAPH}/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${accessToken}`,
    );

    if (!res.ok) {
      const text = await res.text();
      log("error", "meta-ads.list_accounts_failed", { status: res.status, body: text.slice(0, 200) });
      return NextResponse.json(
        { error: `Kunde inte hämta annonskonton (${res.status})` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const rawAccounts = data.data ?? [];

    // Filter to ACTIVE accounts only (account_status === 1)
    const accounts: AdAccountInfo[] = rawAccounts
      .filter((a: Record<string, unknown>) => a.account_status === 1)
      .map((a: Record<string, unknown>) => ({
        id: String(a.id),
        name: String(a.name ?? `Konto ${a.id}`),
        currency: String(a.currency ?? "SEK"),
        timezone: String(a.timezone_name ?? "Europe/Stockholm"),
      }));

    return NextResponse.json(accounts);
  } catch (err) {
    log("error", "meta-ads.accounts_fetch_error", { error: String(err) });
    return NextResponse.json(
      { error: "Kunde inte hämta Meta-annonskonton" },
      { status: 500 },
    );
  }
}
