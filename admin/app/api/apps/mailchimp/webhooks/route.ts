/**
 * Mailchimp — Webhook Handler
 *
 * Handles platform events: syncs contacts, triggers automations,
 * computes segment membership changes.
 */

import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { prisma } from "@/app/_lib/db/prisma";
import { syncContact } from "@/app/_lib/apps/email-marketing/sync";
import { getEmailAdapter } from "@/app/_lib/apps/email-marketing/adapters";

const SUBSCRIBED = [
  "booking.confirmed", "booking.cancelled", "booking.checked_in",
  "booking.checked_out", "order.paid", "guest.created", "guest.updated",
];

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const event = body.event as Record<string, unknown> | undefined;
  const eventType = event?.type as string | undefined;
  const tenantId = event?.tenantId as string | undefined;
  const payload = event?.payload as Record<string, unknown> | undefined;

  if (!eventType || !SUBSCRIBED.includes(eventType) || !tenantId || !payload) {
    return Response.json({ ok: false, error: "Invalid event" }, { status: 400 });
  }

  const email = (payload.guestEmail as string) ?? "";
  if (!email || !email.includes("@")) {
    return Response.json({ received: true, synced: false, reason: "No valid email" });
  }

  // Load app settings
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "mailchimp" } },
  });
  if (!tenantApp || tenantApp.status !== "ACTIVE") {
    return Response.json({ received: true, synced: false, reason: "App not active" });
  }

  const settings = (tenantApp.settings as Record<string, Record<string, unknown>>) ?? {};
  const apiKey = (settings["api-key"]?.apiKey as string) ?? "";
  const listId = (settings["list-select"]?.selectedValue as string) ?? "";
  const automationSettings = settings["automations"] ?? {};

  if (!apiKey || !listId) {
    return Response.json({ received: true, synced: false, reason: "Missing config" });
  }

  const adapter = getEmailAdapter("mailchimp");

  try {
    // Sync contact (recomputes segments, VIP, etc.)
    await syncContact(tenantId, "mailchimp", adapter, email, apiKey, listId, automationSettings);

    // Track automation events if enabled
    if (eventType === "booking.confirmed" && automationSettings.triggerBookingConfirmed) {
      await adapter.trackEvent(apiKey, listId, email, "booking_confirmed", {
        bookingId: payload.bookingId ?? "",
        checkIn: payload.checkIn ?? "",
        checkOut: payload.checkOut ?? "",
      }).catch((err) => log("warn", "mailchimp.track_event_failed", { tenantId, error: String(err) }));
    }

    if (eventType === "booking.checked_out" && automationSettings.triggerCheckedOut) {
      await adapter.trackEvent(apiKey, listId, email, "checkout_followup", {
        bookingId: payload.bookingId ?? "",
      }).catch((err) => log("warn", "mailchimp.track_event_failed", { tenantId, error: String(err) }));
    }

    return Response.json({ received: true, synced: true });
  } catch (err) {
    log("error", "mailchimp.webhook_sync_failed", {
      tenantId, eventType, email, error: String(err).slice(0, 200),
    });
    return Response.json({ received: true, synced: false, error: String(err).slice(0, 200) });
  }
}
