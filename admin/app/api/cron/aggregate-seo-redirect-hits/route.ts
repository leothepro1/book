export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron — Aggregate SEO redirect hits.
 * ════════════════════════════════════
 *
 * Every 5 min. Drains up to BATCH_SIZE rows from `SeoRedirectHit`,
 * groups by `redirectId`, increments `SeoRedirect.hitCount` and
 * updates `lastHitAt` to the latest occurrence in the group,
 * then deletes the drained rows in the same transaction.
 *
 * Atomicity: increment + delete run inside one `$transaction`. A
 * partial failure rolls both back — safer to re-process the batch
 * next run than to double-count.
 *
 * At SeoRedirect.hitCount scale (admin analytics), an occasional
 * re-count from a stuck transaction is acceptable. We optimise
 * for "no double-counting" rather than "exactly-once ever".
 *
 * Auth: `Authorization: Bearer ${env.CRON_SECRET}` — matches
 * `aggregate-analytics` and every other Vercel cron in this
 * project.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

const BATCH_SIZE = 1000;

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const hits = await prisma.seoRedirectHit.findMany({
      take: BATCH_SIZE,
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        redirectId: true,
        occurredAt: true,
      },
    });

    if (hits.length === 0) {
      return Response.json({ ok: true, processed: 0, redirectsUpdated: 0 });
    }

    const counts = new Map<string, { count: number; latest: Date }>();
    for (const hit of hits) {
      const existing = counts.get(hit.redirectId);
      if (existing) {
        existing.count += 1;
        if (hit.occurredAt > existing.latest) {
          existing.latest = hit.occurredAt;
        }
      } else {
        counts.set(hit.redirectId, {
          count: 1,
          latest: hit.occurredAt,
        });
      }
    }

    const hitIds = hits.map((h) => h.id);

    await prisma.$transaction(async (tx) => {
      for (const [redirectId, { count, latest }] of counts) {
        await tx.seoRedirect.update({
          where: { id: redirectId },
          data: {
            hitCount: { increment: count },
            lastHitAt: latest,
          },
        });
      }

      await tx.seoRedirectHit.deleteMany({
        where: { id: { in: hitIds } },
      });
    });

    log("info", "seo.redirect.hits.aggregated", {
      processed: hits.length,
      redirectsUpdated: counts.size,
    });

    return Response.json({
      ok: true,
      processed: hits.length,
      redirectsUpdated: counts.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", "seo.redirect.hits.aggregation_failed", { error: message });
    return Response.json(
      { ok: false, error: "aggregation_failed" },
      { status: 500 },
    );
  }
}
