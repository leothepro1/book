export const dynamic = "force-dynamic";

/**
 * Internal route — append SEO redirect hit.
 * ══════════════════════════════════════════
 *
 * Middleware fires a POST here AFTER the 301 response has gone
 * out (fire-and-forget, never awaited). A failure in this route
 * must NEVER affect redirect serving — it's analytics, not a
 * gate.
 *
 * Writes a single row to `SeoRedirectHit`. The
 * `aggregate-seo-redirect-hits` cron drains these every 5 min
 * into `SeoRedirect.hitCount` + `lastHitAt`.
 *
 * Secured with `x-cron-secret` — even though we trust the
 * middleware, an exposed write endpoint would let a hostile
 * client spam fake hits. DB cascade (`SeoRedirect → Hit`) means a
 * stale redirectId on insert will just fail the FK check, which
 * we swallow.
 */

import { NextResponse } from "next/server";

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let tenantId: unknown;
  let redirectId: unknown;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    tenantId = body.tenantId;
    redirectId = body.redirectId;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof tenantId !== "string" || typeof redirectId !== "string") {
    return NextResponse.json(
      { error: "Missing tenantId or redirectId" },
      { status: 400 },
    );
  }

  try {
    await prisma.seoRedirectHit.create({
      data: { tenantId, redirectId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log("warn", "seo.redirect.hit.failed", {
      tenantId,
      redirectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false });
  }
}
