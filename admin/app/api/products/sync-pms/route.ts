export const dynamic = "force-dynamic";

/**
 * PMS Product Sync Trigger
 * ════════════════════════
 *
 * POST — triggers a PMS product sync for a tenant.
 * Auth: Clerk admin session OR CRON_SECRET Bearer token.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/app/_lib/env";
import { syncPmsProducts } from "@/app/_lib/products/pms-sync";
import { prisma } from "@/app/_lib/db/prisma";

const bodySchema = z.object({
  tenantId: z.string().min(1),
});

export async function POST(req: Request) {
  // Auth: CRON_SECRET or admin session
  const authHeader = req.headers.get("authorization");
  const isCron = authHeader === `Bearer ${env.CRON_SECRET}`;

  if (!isCron) {
    // Try admin auth
    try {
      const { requireAdmin } = await import("@/app/(admin)/_lib/auth/devAuth");
      const auth = await requireAdmin();
      if (!auth.ok) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "tenantId krävs" },
      { status: 400 },
    );
  }

  // Determine provider from tenant integration
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: body.tenantId },
    select: { provider: true, status: true },
  });

  const provider = integration?.status === "active" ? integration.provider : "manual";

  try {
    const result = await syncPmsProducts(body.tenantId, provider);
    return NextResponse.json({
      ok: true,
      result,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[sync-pms] Sync failed:", err);
    return NextResponse.json(
      { error: "SYNC_FAILED", message: err instanceof Error ? err.message : "Sync failed" },
      { status: 503 },
    );
  }
}
