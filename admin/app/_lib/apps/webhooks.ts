/**
 * App Webhooks — Platform event distribution to installed apps.
 *
 * emitPlatformEvent() is the ONLY way to create PlatformEventLog rows.
 * deliverEvent() is the ONLY way to write to AppWebhookDelivery.
 * Emission is fire-and-forget — never throws to callers.
 *
 * Retry schedule: 1min → 5min → 30min → 2h → 8h (5 attempts max).
 * After 5 failed attempts → EXHAUSTED (manual retry only).
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { resilientFetch } from "@/app/_lib/http/fetch";
import { log } from "@/app/_lib/logger";
import { getApp } from "./registry";
import { decryptAppSettings } from "./settings-crypto";

// Import all app definitions
import "./definitions";

// ── Platform Event Types ────────────────────────────────────────

export type PlatformEventType =
  | "order.created"
  | "order.paid"
  | "order.fulfilled"
  | "order.cancelled"
  | "order.refunded"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.checked_in"
  | "booking.checked_out"
  | "guest.created"
  | "guest.updated"
  | "availability.updated"
  // ── DraftOrder events (FAS 6.5) ──
  | "draft_order.created"
  | "draft_order.updated"
  | "draft_order.cancelled"
  | "draft_order.invoiced"
  | "draft_order.paid"
  | "draft_order.completed";

export type PlatformEvent = {
  type: PlatformEventType;
  tenantId: string;
  payload: Record<string, unknown>;
};

// ── Retry Schedule (exponential backoff) ────────────────────────

const RETRY_DELAYS_MS = [
  1 * 60 * 1000,     // 1 min
  5 * 60 * 1000,     // 5 min
  30 * 60 * 1000,    // 30 min
  2 * 60 * 60 * 1000, // 2 hours
  8 * 60 * 60 * 1000, // 8 hours
];

const MAX_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10000;

// ── Emit Platform Event ─────────────────────────────────────────

/**
 * Emit a platform event and fan out to all subscribed apps.
 * Fire-and-forget — never throws. Callers should:
 *   await emitPlatformEvent(...).catch(err => log("error", ...))
 */
export async function emitPlatformEvent(event: PlatformEvent): Promise<void> {
  try {
    // 1. Write to PlatformEventLog
    const eventLog = await prisma.platformEventLog.create({
      data: {
        tenantId: event.tenantId,
        eventType: event.type,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });

    // 2. Find all ACTIVE apps for this tenant that subscribe to this event
    const tenantApps = await prisma.tenantApp.findMany({
      where: { tenantId: event.tenantId, status: "ACTIVE" },
      select: { appId: true },
    });

    const subscribedApps = tenantApps.filter((ta) => {
      const def = getApp(ta.appId);
      return def?.webhooks.includes(event.type);
    });

    if (subscribedApps.length === 0) return;

    // 3. Create delivery records and attempt first delivery
    for (const app of subscribedApps) {
      try {
        await deliverEvent(event.tenantId, app.appId, eventLog.id, event.type, event.payload);
      } catch (err) {
        log("error", "webhook.initial_delivery_failed", {
          tenantId: event.tenantId,
          appId: app.appId,
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log("error", "webhook.emit_failed", {
      tenantId: event.tenantId,
      eventType: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Deliver Event to App Handler ────────────────────────────────

/**
 * Attempt to deliver a platform event to an app's handler route.
 * Creates or updates AppWebhookDelivery record.
 * On failure: schedules next retry based on attempt count.
 * After MAX_ATTEMPTS failures: marks EXHAUSTED.
 */
export async function deliverEvent(
  tenantId: string,
  appId: string,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const app = getApp(appId);
  if (!app) return;

  // Atomically find or create delivery record (no TOCTOU)
  const delivery = await prisma.appWebhookDelivery.upsert({
    where: { eventId_appId: { eventId, appId } },
    create: { tenantId, appId, eventId, eventType, status: "PENDING" },
    update: {}, // never reset if exists
  });

  // Don't retry DELIVERED or EXHAUSTED
  if (delivery.status === "DELIVERED" || delivery.status === "EXHAUSTED") return;

  const attempt = delivery.attempts + 1;

  // Construct handler URL
  const handlerPath = `/api/apps/${appId}/webhooks`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${baseUrl}${handlerPath}`;

  let secret: string;
  try {
    const { env } = await import("@/app/_lib/env");
    secret = env.INTERNAL_API_SECRET;
  } catch {
    await prisma.appWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: attempt,
        lastAttemptAt: new Date(),
        errorMessage: "INTERNAL_API_SECRET not configured",
        nextRetryAt: getNextRetryAt(attempt),
      },
    });
    return;
  }

  // Load real app settings for the handler
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
    select: { settings: true, status: true },
  });

  if (!tenantApp || tenantApp.status === "UNINSTALLED") {
    await prisma.appWebhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "EXHAUSTED", exhaustedAt: new Date(), errorMessage: "App uninstalled" },
    });
    return;
  }

  const rawSettings = (tenantApp.settings as Record<string, unknown>) ?? {};
  const appSettings = decryptAppSettings(appId, rawSettings);

  const start = Date.now();
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await resilientFetch(url, {
      service: "app-webhook", timeout: DELIVERY_TIMEOUT_MS,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        event: { type: eventType, tenantId, payload },
        settings: appSettings,
      }),
    });

    responseStatus = res.status;

    if (!res.ok) {
      errorMessage = await res.text().catch(() => `HTTP ${res.status}`);
      errorMessage = errorMessage.slice(0, 500);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Delivery failed";
    if (err instanceof Error && err.name === "AbortError") {
      errorMessage = `Timeout after ${DELIVERY_TIMEOUT_MS}ms`;
    }
  }

  const responseTimeMs = Date.now() - start;
  const success = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

  if (success) {
    await prisma.appWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "DELIVERED",
        attempts: attempt,
        lastAttemptAt: new Date(),
        responseStatus,
        responseTimeMs,
        errorMessage: null,
        nextRetryAt: null,
      },
    });
    return;
  }

  // Failed — check if exhausted
  if (attempt >= MAX_ATTEMPTS) {
    await prisma.appWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "EXHAUSTED",
        attempts: attempt,
        lastAttemptAt: new Date(),
        responseStatus,
        responseTimeMs,
        errorMessage,
        exhaustedAt: new Date(),
        nextRetryAt: null,
      },
    });
    return;
  }

  // Schedule retry
  await prisma.appWebhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "FAILED",
      attempts: attempt,
      lastAttemptAt: new Date(),
      responseStatus,
      responseTimeMs,
      errorMessage,
      nextRetryAt: getNextRetryAt(attempt),
    },
  });
}

function getNextRetryAt(attempt: number): Date {
  const delayIdx = Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_MS[delayIdx]);
}
