/**
 * Google Ads — Health Check Route
 *
 * GET /api/apps/google-ads/health?tenantId=...&appId=...
 *
 * Checks OAuth token validity and Google Ads API reachability.
 * Returns appropriate health status based on response.
 *
 * 200 + ok: HEALTHY
 * 200 + degraded: DEGRADED (slow response)
 * 503: UNHEALTHY (auth or API failure)
 */

import { env } from "@/app/_lib/env";
import { getValidAccessToken } from "@/app/_lib/apps/google-ads/oauth";
import { log } from "@/app/_lib/logger";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
  }

  // Step 1: Verify OAuth token is valid
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", "google-ads.health_token_failed", { tenantId, error: msg });
    return Response.json(
      { ok: false, error: "OAuth-token ogiltig — återanslut Google-kontot" },
      { status: 503 },
    );
  }

  // Step 2: Ping Google Ads API
  try {
    const start = Date.now();
    const res = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;

    if (res.status === 401) {
      return Response.json(
        { ok: false, error: "Åtkomst nekad — återanslut Google-kontot" },
        { status: 503 },
      );
    }

    if (res.status === 403) {
      return Response.json(
        { ok: false, error: "Behörighet saknas för valt konto", latencyMs },
        { status: 503 },
      );
    }

    if (!res.ok) {
      return Response.json(
        { ok: false, error: `Google Ads API returnerade ${res.status}`, latencyMs },
        { status: 503 },
      );
    }

    return Response.json({ ok: true, provider: "google-ads", latencyMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (err instanceof Error && err.name === "TimeoutError") {
      return Response.json(
        { ok: false, error: "Google Ads API svarar långsamt (timeout)" },
        { status: 503 },
      );
    }

    log("error", "google-ads.health_api_error", { tenantId, error: msg });
    return Response.json(
      { ok: false, error: `Anslutningsfel: ${msg.slice(0, 100)}` },
      { status: 503 },
    );
  }
}
