/**
 * Meta Ads — Conversions API (CAPI) Client
 *
 * sendConversionEvent() never throws — returns result, caller decides.
 * All PII hashed SHA-256 before leaving our servers — never send plaintext.
 * event_id always set — Meta uses it for deduplication with browser pixel.
 * value always in currency unit (float) — never ören to Meta API.
 * testEventCode only sent when present — never send empty string.
 */

import { createHash } from "node:crypto";
import { getValidAccessToken } from "./oauth";
import { log } from "@/app/_lib/logger";

const META_GRAPH = "https://graph.facebook.com/v19.0";

// ── Types ───────────────────────────────────────────────────────

export type MetaConversionEvent = {
  eventName: "Purchase" | "InitiateCheckout" | "Lead";
  eventId: string;              // for deduplication — use orderId/bookingId
  eventTime: number;            // Unix timestamp (seconds)
  actionSource: "website";
  value: number;                // in currency unit (not ören) — 129.00
  currency: string;
  userData: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  customData?: {
    orderId?: string;
    contentType?: string;       // "hotel_room" | "product"
  };
};

export type MetaConversionResult = {
  success: boolean;
  eventsReceived?: number;
  fbtraceId?: string;
  error?: string;
};

// ── PII Hashing ─────────────────────────────────────────────────

/**
 * Hash a string with SHA-256. Lowercase + trim before hashing.
 * Returns hex string. Never send plaintext PII to Meta.
 */
function hashSha256(value: string): string {
  return createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

/**
 * Normalize phone number: digits only, include country code.
 * "+46 70-123 45 67" → "46701234567"
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // If starts with 0 (Swedish local), prepend 46
  if (digits.startsWith("0")) return `46${digits.slice(1)}`;
  return digits;
}

// ── Send Conversion Event ───────────────────────────────────────

/**
 * Send a conversion event to Meta Conversions API.
 * Never throws — returns result, let caller decide how to handle failure.
 */
export async function sendConversionEvent(
  tenantId: string,
  pixelId: string,
  event: MetaConversionEvent,
  options: {
    enhancedMatching: boolean;
    testEventCode?: string;
  },
): Promise<MetaConversionResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantId);
  } catch (err) {
    log("error", "meta-ads.capi_token_failed", {
      tenantId, eventId: event.eventId, error: String(err),
    });
    return { success: false, error: "Meta-token ogiltig" };
  }

  // Build user_data with hashed PII
  const userData: Record<string, string[]> = {};

  if (options.enhancedMatching) {
    if (event.userData.email) {
      userData.em = [hashSha256(event.userData.email)];
    }
    if (event.userData.phone) {
      userData.ph = [hashSha256(normalizePhone(event.userData.phone))];
    }
    if (event.userData.firstName) {
      userData.fn = [hashSha256(event.userData.firstName)];
    }
    if (event.userData.lastName) {
      userData.ln = [hashSha256(event.userData.lastName)];
    }
  }

  const eventPayload: Record<string, unknown> = {
    event_name: event.eventName,
    event_id: event.eventId,
    event_time: event.eventTime,
    action_source: event.actionSource,
    user_data: userData,
  };

  // Add value + currency
  if (event.value > 0) {
    eventPayload.custom_data = {
      value: event.value,
      currency: event.currency,
      ...event.customData,
    };
  } else if (event.customData) {
    eventPayload.custom_data = event.customData;
  }

  const body: Record<string, unknown> = {
    data: [eventPayload],
    access_token: accessToken,
  };

  // Only include test_event_code when present and non-empty
  if (options.testEventCode && options.testEventCode.trim()) {
    body.test_event_code = options.testEventCode.trim();
  }

  try {
    const res = await fetch(`${META_GRAPH}/${pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await res.json();

    if (!res.ok) {
      const errorMsg = result.error?.message ?? `HTTP ${res.status}`;
      log("error", "meta-ads.capi_send_failed", {
        tenantId, eventId: event.eventId,
        status: res.status, error: String(errorMsg).slice(0, 300),
      });
      return { success: false, error: String(errorMsg).slice(0, 200) };
    }

    log("info", "meta-ads.capi_sent", {
      tenantId, eventId: event.eventId,
      eventName: event.eventName, eventsReceived: result.events_received,
    });

    return {
      success: true,
      eventsReceived: result.events_received,
      fbtraceId: result.fbtrace_id,
    };
  } catch (err) {
    log("error", "meta-ads.capi_send_error", {
      tenantId, eventId: event.eventId, error: String(err),
    });
    return { success: false, error: String(err) };
  }
}
