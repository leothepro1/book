/**
 * Server-side Analytics Emission
 * ══════════════════════════════
 *
 * emitAnalyticsEvent() — the single function for server-side analytics emission.
 * Used exclusively for commerce events: ORDER_CREATED, ORDER_PAID, ORDER_CANCELLED, ORDER_REFUNDED.
 *
 * INVARIANTS:
 * - Never throws. Always fire-and-forget.
 * - Never called inside a $transaction block.
 * - Never called from frontend code.
 * - If it fails, the calling commerce operation is unaffected.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { AnalyticsEventType, Prisma } from "@prisma/client";

export type EmitAnalyticsEventParams = {
  tenantId: string;
  eventType: AnalyticsEventType;
  sessionId?: string;
  visitorId?: string;
  payload: Record<string, unknown>;
};

export async function emitAnalyticsEvent(
  params: EmitAnalyticsEventParams,
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        tenantId: params.tenantId,
        sessionId: params.sessionId ?? "server",
        visitorId: params.visitorId ?? "server",
        eventType: params.eventType,
        occurredAt: new Date(),
        deviceType: "DESKTOP",
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    log("error", "analytics.emit_failed", {
      tenantId: params.tenantId,
      eventType: params.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
