/**
 * Email Marketing — Webhook Handler
 *
 * Receives platform events this app subscribes to:
 *   - booking.confirmed: Add guest to mailing list, tag with booking info
 *   - order.paid: Tag customer with purchase info, trigger post-purchase flow
 *   - guest.updated: Sync updated guest data to provider
 *
 * Real implementation per event:
 *   booking.confirmed → Mailchimp: PUT /lists/{listId}/members/{hash}
 *     with merge fields (name, booking dates, room type), tags
 *
 *   order.paid → Mailchimp: PUT member + add purchase tag
 *
 *   guest.updated → Mailchimp: PATCH member with new data
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

const SUBSCRIBED = ["booking.confirmed", "order.paid", "guest.updated"];

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

  log("info", "app.email-marketing.webhook_received", { eventType, tenantId: body.event?.tenantId });

  // TODO: Real implementation — sync to Mailchimp/Klaviyo
  return Response.json({ ok: true, handler: "email-marketing", event: eventType });
}
