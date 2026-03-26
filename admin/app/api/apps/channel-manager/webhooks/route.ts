/**
 * Channel Manager — Webhook Handler
 *
 * Receives platform events this app subscribes to:
 *   - booking.confirmed: Update availability on OTA channels (reduce stock)
 *   - booking.cancelled: Release availability on OTA channels (increase stock)
 *   - availability.updated: Push rate/restriction changes to channels
 *
 * Real implementation per event:
 *   booking.confirmed → For each enabled channel:
 *     - Booking.com: POST /availability with reduced count
 *     - Expedia: POST /lodging/availability
 *     - Airbnb: PATCH /calendar with blocked dates
 *
 *   booking.cancelled → Reverse of confirmed (release dates)
 *
 *   availability.updated → Push new rates/restrictions to all channels
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

const SUBSCRIBED = ["booking.confirmed", "booking.cancelled", "availability.updated"];

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const eventType = body.event?.type;

  if (!eventType || !SUBSCRIBED.includes(eventType)) {
    return Response.json({ ok: false, error: "Unsubscribed event type" }, { status: 400 });
  }

  log("info", "app.channel-manager.webhook_received", { eventType, tenantId: body.event?.tenantId });

  // TODO: Real implementation — push to OTA channels
  return Response.json({ ok: true, handler: "channel-manager", event: eventType });
}
