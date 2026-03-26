/**
 * Google Ads — Webhook Handler
 *
 * POST /api/apps/google-ads/webhooks
 *
 * Receives platform events and sends conversions to Google Ads API.
 * Returns 200 for conversion failures (permanent — no retry needed).
 * Returns 500 only for infrastructure failures (triggers retry).
 *
 * Events handled:
 *   order.paid → Upload purchase conversion
 *   order.refunded → Upload conversion adjustment (retraction)
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { uploadConversion, uploadConversionAdjustment } from "@/app/_lib/apps/google-ads/conversions";
import type { ConversionData } from "@/app/_lib/apps/google-ads/conversions";

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

  // Load app settings from the event body (injected by deliverEvent)
  const settings = body.settings as Record<string, Record<string, unknown>> | undefined;
  const trackingConfig = settings?.["tracking-config"] ?? {};
  const accountData = settings?.["select-account"] ?? {};

  const customerId = (accountData.selectedValue as string) ?? "";
  const conversionActionId = (trackingConfig.conversionActionId as string) ?? "";
  const enhancedConversions = (trackingConfig.enhancedConversions as boolean) ?? false;
  const trackPurchase = (trackingConfig.trackPurchase as boolean) ?? true;
  const sendRevenue = (trackingConfig.sendRevenue as boolean) ?? true;

  if (!customerId) {
    log("warn", "google-ads.webhook_no_customer_id", { tenantId, eventType });
    return Response.json({ received: true, uploaded: false, error: "No customer ID configured" });
  }

  if (!conversionActionId) {
    log("warn", "google-ads.webhook_no_conversion_action", { tenantId, eventType });
    return Response.json({ received: true, uploaded: false, error: "No conversion action ID configured" });
  }

  // ── Handle order.paid ─────────────────────────────────────────

  if (eventType === "order.paid") {
    if (!trackPurchase) {
      return Response.json({ received: true, uploaded: false, reason: "Purchase tracking disabled" });
    }

    const conversionData: ConversionData = {
      conversionActionId,
      orderId: (payload.orderId as string) ?? "",
      orderAmount: sendRevenue ? ((payload.totalAmount as number) ?? 0) : 0,
      currency: (payload.currency as string) ?? "SEK",
      conversionDateTime: (payload.paidAt as string) ?? new Date().toISOString(),
      guestEmail: enhancedConversions ? (payload.guestEmail as string) : undefined,
      gclid: (payload.gclid as string) ?? undefined,
    };

    const result = await uploadConversion(tenantId, customerId, conversionData, enhancedConversions);

    return Response.json({
      received: true,
      uploaded: result.success,
      error: result.partialFailureError,
    });
  }

  // ── Handle order.refunded ─────────────────────────────────────

  if (eventType === "order.refunded") {
    const result = await uploadConversionAdjustment(tenantId, customerId, {
      conversionActionId,
      orderId: (payload.orderId as string) ?? "",
      adjustmentType: "RETRACTION",
      adjustmentDateTime: new Date().toISOString(),
      currency: (payload.currency as string) ?? "SEK",
    });

    return Response.json({
      received: true,
      uploaded: result.success,
      error: result.partialFailureError,
    });
  }

  return Response.json({ received: true, uploaded: false });
}
