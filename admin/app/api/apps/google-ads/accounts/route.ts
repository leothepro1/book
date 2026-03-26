/**
 * Google Ads — List Accessible Accounts
 *
 * GET /api/apps/google-ads/accounts
 *
 * Returns Google Ads accounts the authenticated user can access.
 * Used as the fetchEndpoint for the account_select wizard step.
 * Auth: requireAdmin() — internal only, no INTERNAL_API_SECRET.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getValidAccessToken } from "@/app/_lib/apps/google-ads/oauth";
import { log } from "@/app/_lib/logger";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";

type AccountInfo = {
  customerId: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
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
    log("error", "google-ads.accounts_token_failed", { error: String(err) });
    return NextResponse.json(
      { error: "OAuth-token ogiltig — återanslut Google-kontot" },
      { status: 401 },
    );
  }

  try {
    // Step 1: List accessible customer resource names
    const listRes = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
    });

    if (!listRes.ok) {
      const text = await listRes.text();
      log("error", "google-ads.list_customers_failed", { status: listRes.status, body: text.slice(0, 200) });
      return NextResponse.json(
        { error: `Kunde inte hämta konton (${listRes.status})` },
        { status: 502 },
      );
    }

    const listData = await listRes.json();
    const resourceNames: string[] = listData.resourceNames ?? [];

    // Step 2: Fetch details for each customer
    const accounts: AccountInfo[] = [];

    for (const resourceName of resourceNames) {
      const customerId = resourceName.replace("customers/", "");
      try {
        const detailRes = await fetch(`${GOOGLE_ADS_API}/${resourceName}`, {
          headers: {
            authorization: `Bearer ${accessToken}`,
            "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
          },
        });

        if (detailRes.ok) {
          const detail = await detailRes.json();
          accounts.push({
            customerId,
            descriptiveName: detail.descriptiveName ?? `Konto ${customerId}`,
            currencyCode: detail.currencyCode ?? "SEK",
            timeZone: detail.timeZone ?? "Europe/Stockholm",
          });
        } else {
          // Can't access this customer — skip silently
          accounts.push({
            customerId,
            descriptiveName: `Konto ${customerId}`,
            currencyCode: "SEK",
            timeZone: "Europe/Stockholm",
          });
        }
      } catch {
        accounts.push({
          customerId,
          descriptiveName: `Konto ${customerId}`,
          currencyCode: "SEK",
          timeZone: "Europe/Stockholm",
        });
      }
    }

    return NextResponse.json(accounts);
  } catch (err) {
    log("error", "google-ads.accounts_fetch_error", { error: String(err) });
    return NextResponse.json(
      { error: "Kunde inte hämta Google Ads-konton" },
      { status: 500 },
    );
  }
}
