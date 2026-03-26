/**
 * Meta Ads — Webhook Handler
 *
 * POST /api/apps/meta-ads/webhooks
 *
 * Receives platform events and sends CAPI events to Meta.
 * Returns 200 for conversion failures (permanent — no retry).
 * Returns 500 only for infrastructure failures (triggers retry).
 *
 * Events handled:
 *   order.paid → Purchase event via CAPI
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { sendConversionEvent } from "@/app/_lib/apps/meta-ads/conversions";
import type { MetaConversionEvent } from "@/app/_lib/apps/meta-ads/conversions";

const SUBSCRIBED = ["order.paid", "order.refunded"];

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event as Record<string, unknown> | undefined;
  const eventType = event?.type as string | undefined;
  const tenantId = event?.tenantId as string | undefined;
  const payload = event?.payload as Record<string, unknown> | undefined;

  if (!eventType || !SUBSCRIBED.includes(eventType) || !tenantId || !payload) {
    return Response.json({ ok: false, error: "Invalid event" }, { status: 400 });
  }

  const settings = body.settings as Record<string, Record<string, unknown>> | undefined;
  const pixelConfig = settings?.["pixel-config"] ?? {};

  const pixelId = (pixelConfig.pixelId as string) ?? "";
  const sendPurchaseEvents = (pixelConfig.sendPurchaseEvents as boolean) ?? true;
  const enhancedMatching = (pixelConfig.enhancedMatching as boolean) ?? true;
  const testEventCode = (pixelConfig.testEventCode as string) ?? "";

  if (!pixelId) {
    log("warn", "meta-ads.webhook_no_pixel_id", { tenantId, eventType });
    return Response.json({ received: true, uploaded: false, error: "No Pixel ID configured" });
  }

  // ── Handle order.paid ─────────────────────────────────────────

  if (eventType === "order.paid") {
    if (!sendPurchaseEvents) {
      return Response.json({ received: true, uploaded: false, reason: "Purchase events disabled" });
    }

    const totalAmount = (payload.totalAmount as number) ?? 0;
    const currency = (payload.currency as string) ?? "SEK";

    const conversionEvent: MetaConversionEvent = {
      eventName: "Purchase",
      eventId: (payload.orderId as string) ?? "",
      eventTime: Math.floor(new Date((payload.paidAt as string) ?? Date.now()).getTime() / 1000),
      actionSource: "website",
      value: totalAmount / 100,     // ören → currency unit
      currency,
      userData: {
        email: (payload.guestEmail as string) ?? undefined,
      },
      customData: {
        orderId: (payload.orderId as string) ?? undefined,
        contentType: "product",
      },
    };

    const result = await sendConversionEvent(tenantId, pixelId, conversionEvent, {
      enhancedMatching,
      testEventCode: testEventCode || undefined,
    });

    return Response.json({
      received: true,
      uploaded: result.success,
      eventsReceived: result.eventsReceived,
      error: result.error,
    });
  }

  // ── Handle order.refunded ─────────────────────────────────────

  if (eventType === "order.refunded") {
    // Meta CAPI has no native refund event — send custom "Refund" event
    const refundEvent: MetaConversionEvent = {
      eventName: "Lead", // Meta accepts custom names but Lead is standard
      eventId: `REFUND_${(payload.orderId as string) ?? ""}`,
      eventTime: Math.floor(Date.now() / 1000),
      actionSource: "website",
      value: 0, // Meta doesn't support negative values
      currency: (payload.currency as string) ?? "SEK",
      userData: {
        email: (payload.guestEmail as string) ?? undefined,
      },
      customData: {
        orderId: (payload.orderId as string) ?? undefined,
        contentType: "refund",
      },
    };

    const result = await sendConversionEvent(tenantId, pixelId, refundEvent, {
      enhancedMatching,
      testEventCode: testEventCode || undefined,
    });

    log("info", "meta-ads.refund_event_sent", {
      tenantId,
      orderId: (payload.orderId as string) ?? "",
      success: result.success,
    });

    return Response.json({
      received: true,
      uploaded: result.success,
      error: result.error,
    });
  }

  return Response.json({ received: true, uploaded: false });
}
