export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * RUM Beacon Endpoint v2
 * ══════════════════════
 *
 * POST /api/rum/beacon
 * Public — no auth. Protected by DB-backed rate limiting + Zod.
 * ALWAYS returns 204 — navigator.sendBeacon ignores responses.
 * NEVER logs IP, UA, or request body.
 */

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const RumBeaconSchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().uuid(),
  lcp: z.number().positive().max(60_000).nullable(),
  inp: z.number().positive().max(10_000).nullable(),
  cls: z.number().min(0).max(10).nullable(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "other"]),
  pathname: z.string().max(500).startsWith("/"),
  isHardReload: z.boolean(),
  connection: z.enum(["4g", "3g", "2g", "slow-2g"]).nullable(),
  occurredAt: z.string().datetime(),
});

// ── DB-backed rate limiting (atomic, cross-isolate) ─────────

async function isRateLimited(tenantId: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `INSERT INTO "RumRateLimit" ("id", "tenantId", "count", "windowStart")
       VALUES (gen_random_uuid(), $1, 1, NOW())
       ON CONFLICT ("tenantId") DO UPDATE SET
         "count" = CASE
           WHEN NOW() - "RumRateLimit"."windowStart" > INTERVAL '1 minute'
           THEN 1
           ELSE "RumRateLimit"."count" + 1
         END,
         "windowStart" = CASE
           WHEN NOW() - "RumRateLimit"."windowStart" > INTERVAL '1 minute'
           THEN NOW()
           ELSE "RumRateLimit"."windowStart"
         END
       RETURNING "count"`,
      tenantId,
    );
    return (result[0]?.count ?? 0) > 1000;
  } catch {
    return false; // Fail-open — rate limit DB issue should not block beacons
  }
}

// ── Handler ─────────────────────────────────────────────────

const RESPONSE_204 = new Response(null, { status: 204 });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RumBeaconSchema.safeParse(body);
    if (!parsed.success) return RESPONSE_204;

    const data = parsed.data;

    // Timestamp validation: max 10 min old, not in future
    const age = Date.now() - new Date(data.occurredAt).getTime();
    if (age > 10 * 60 * 1000 || age < -30_000) return RESPONSE_204;

    // Rate limit (DB-backed — works across Vercel isolates)
    if (await isRateLimited(data.tenantId)) return RESPONSE_204;

    // Tenant existence
    const tenant = await prisma.tenant.findUnique({
      where: { id: data.tenantId },
      select: { id: true },
    });
    if (!tenant) return RESPONSE_204;

    // Write event
    await prisma.rumEvent.create({
      data: {
        tenantId: data.tenantId,
        sessionId: data.sessionId,
        lcp: data.lcp,
        inp: data.inp,
        cls: data.cls,
        deviceType: data.deviceType,
        pathname: data.pathname,
        isHardReload: data.isHardReload,
        connection: data.connection,
        occurredAt: new Date(data.occurredAt),
      },
    });
  } catch (err) {
    log("error", "rum.beacon_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return RESPONSE_204;
}
