/**
 * Meta Ads — Health Check Route
 *
 * GET /api/apps/meta-ads/health?tenantId=...&appId=...
 *
 * Checks OAuth token validity, expiry warning, and Meta API reachability.
 * Token expiry checked proactively (7 day warning).
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { decryptTokens } from "@/app/_lib/apps/meta-ads/oauth";
import { log } from "@/app/_lib/logger";

const META_GRAPH = "https://graph.facebook.com/v19.0";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

  // Load tokens from settings
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "meta-ads" } },
  });

  if (!tenantApp) {
    return Response.json({ ok: false, error: "Meta Ads app not installed" }, { status: 503 });
  }

  const settings = tenantApp.settings as Record<string, Record<string, unknown>>;
  const oauthData = settings["connect-meta"];

  if (!oauthData?.encryptedData || !oauthData?.encryptedIv) {
    return Response.json(
      { ok: false, error: "Meta-token ogiltig — återanslut Meta-kontot" },
      { status: 503 },
    );
  }

  let tokens;
  try {
    tokens = decryptTokens(
      oauthData.encryptedData as string,
      oauthData.encryptedIv as string,
    );
  } catch {
    return Response.json(
      { ok: false, error: "Kunde inte dekryptera Meta-token" },
      { status: 503 },
    );
  }

  // Check token expiry
  const expiresAt = new Date(tokens.expiresAt).getTime();
  const now = Date.now();

  if (expiresAt <= now) {
    return Response.json(
      { ok: false, error: "Meta-session utgången — återanslut Meta-kontot" },
      { status: 503 },
    );
  }

  if (expiresAt < now + SEVEN_DAYS_MS) {
    const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
    return Response.json({
      ok: true,
      status: "DEGRADED",
      provider: "meta-ads",
      latencyMs: 0,
      message: `Token löper ut om ${daysLeft} dagar — förnya anslutningen`,
    });
  }

  // Ping Meta Graph API
  try {
    const start = Date.now();
    const res = await fetch(
      `${META_GRAPH}/me?access_token=${tokens.accessToken}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const latencyMs = Date.now() - start;

    if (res.status === 190 || res.status === 401) {
      return Response.json(
        { ok: false, error: "Meta-session utgången — återanslut Meta-kontot" },
        { status: 503 },
      );
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errorMsg = (data as Record<string, Record<string, string>>).error?.message ?? `HTTP ${res.status}`;
      return Response.json(
        { ok: false, error: `Meta API-fel: ${String(errorMsg).slice(0, 100)}` },
        { status: 503 },
      );
    }

    return Response.json({ ok: true, provider: "meta-ads", latencyMs });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return Response.json(
        { ok: false, error: "Meta API svarar långsamt (timeout)" },
        { status: 503 },
      );
    }

    log("error", "meta-ads.health_api_error", { tenantId, error: String(err) });
    return Response.json(
      { ok: false, error: `Anslutningsfel: ${String(err).slice(0, 100)}` },
      { status: 503 },
    );
  }
}
