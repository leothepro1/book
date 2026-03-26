/**
 * Guest CRM — Webhook Handler
 *
 * Receives platform events this app subscribes to:
 *   - booking.confirmed: Enrich guest profile with booking data
 *   - guest.updated: Merge/update guest profile, check VIP threshold
 *
 * Real implementation per event:
 *   booking.confirmed → Update guest profile:
 *     - Increment stay count
 *     - Check VIP threshold → auto-tag if reached
 *     - Update last_stayed_at
 *
 *   guest.updated → Merge new data into profile:
 *     - Auto-merge by email if autoMerge enabled
 *     - Update contact info
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

const SUBSCRIBED = ["booking.confirmed", "guest.updated"];

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

  log("info", "app.guest-crm.webhook_received", { eventType, tenantId: body.event?.tenantId });

  // TODO: Real implementation — enrich guest profiles
  return Response.json({ ok: true, handler: "guest-crm", event: eventType });
}
