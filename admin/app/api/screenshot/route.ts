export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Screenshot Generation Endpoint
 * ═══════════════════════════════
 *
 * POST /api/screenshot
 * Auth: Bearer SCREENSHOT_SECRET
 *
 * Generates desktop + mobile screenshots for a tenant's portal.
 * Called by publishDraft() or cron after screenshotPending is set.
 */

import { generateTenantScreenshots } from "@/app/_lib/screenshots/generate";
import { log } from "@/app/_lib/logger";
import { timingSafeEqual } from "crypto";

function verifyAuth(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${secret}`;
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const secret = process.env.SCREENSHOT_SECRET;
  if (!secret) {
    return Response.json({ error: "SCREENSHOT_SECRET not configured" }, { status: 500 });
  }

  if (!verifyAuth(req.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenantId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }

  try {
    await generateTenantScreenshots(body.tenantId);
    return Response.json({ ok: true });
  } catch (err) {
    log("error", "api.screenshot.failed", {
      tenantId: body.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Generation failed" }, { status: 500 });
  }
}
