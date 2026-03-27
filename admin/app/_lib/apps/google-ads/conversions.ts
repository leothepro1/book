/**
 * Google Ads — Conversions API Client (Server-Side)
 *
 * uploadConversion() never throws — returns result, caller decides.
 * Enhanced conversions hash email with SHA-256 — never send plaintext.
 * Amount: converts ören to currency unit (12900 ören → 129.00 SEK).
 * Conversion datetime: Google requires "yyyy-MM-dd HH:mm:ss+00:00" format.
 */

import { createHash } from "node:crypto";
import { getValidAccessToken } from "./oauth";
import { resilientFetch } from "@/app/_lib/http/fetch";
import { log } from "@/app/_lib/logger";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";

// ── Types ───────────────────────────────────────────────────────

export type ConversionData = {
  conversionActionId: string;   // from TenantApp settings
  orderId: string;              // used for deduplication
  orderAmount: number;          // in ören
  currency: string;             // "SEK", "EUR", etc.
  conversionDateTime: string;   // ISO string — converted to Google format internally
  guestEmail?: string;          // for enhanced conversions (hashed SHA-256)
  gclid?: string;               // Google Click ID — significantly improves match rate
};

export type ConversionUploadResult = {
  success: boolean;
  partialFailureError?: string;
};

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Convert ISO datetime to Google Ads format: "yyyy-MM-dd HH:mm:ss+00:00"
 */
function toGoogleDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

/**
 * Hash email with SHA-256 (lowercase, trimmed) for enhanced conversions.
 * Returns hex string. Never send plaintext email to Google.
 */
function hashEmail(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

/**
 * Convert ören to currency decimal string (12900 → "129.00").
 */
function orenToDecimal(oren: number): string {
  return (oren / 100).toFixed(2);
}

// ── Upload Conversion ───────────────────────────────────────────

/**
 * Send a conversion event to Google Ads Conversions API.
 * Never throws — returns result, let caller decide how to handle failure.
 */
export async function uploadConversion(
  tenantId: string,
  customerId: string,
  data: ConversionData,
  enhancedConversions: boolean = false,
): Promise<ConversionUploadResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantId);
  } catch (err) {
    log("error", "google-ads.conversion_token_failed", {
      tenantId, orderId: data.orderId, error: String(err),
    });
    return { success: false, partialFailureError: "OAuth-token ogiltig" };
  }

  // Build conversion operation
  const conversionAction = `customers/${customerId}/conversionActions/${data.conversionActionId}`;

  const clickConversion: Record<string, unknown> = {
    conversionAction,
    conversionDateTime: toGoogleDateTime(data.conversionDateTime),
    conversionValue: parseFloat(orenToDecimal(data.orderAmount)),
    currencyCode: data.currency,
    orderId: data.orderId,
    ...(data.gclid ? { gclid: data.gclid } : {}),
  };

  // Enhanced conversions — add hashed email as user identifier
  if (enhancedConversions && data.guestEmail) {
    clickConversion.userIdentifiers = [
      {
        hashedEmail: hashEmail(data.guestEmail),
      },
    ];
  }

  const requestBody = {
    conversions: [clickConversion],
    partialFailure: true,
  };

  try {
    const cleanCustomerId = customerId.replace(/-/g, "");
    const url = `${GOOGLE_ADS_API}/customers/${cleanCustomerId}:uploadClickConversions`;

    const res = await resilientFetch(url, {
      service: "google-ads", timeout: 8_000,
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      log("error", "google-ads.conversion_upload_failed", {
        tenantId, orderId: data.orderId,
        status: res.status, body: text.slice(0, 300),
      });
      return { success: false, partialFailureError: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const result = await res.json();

    if (result.partialFailureError) {
      log("warn", "google-ads.conversion_partial_failure", {
        tenantId, orderId: data.orderId,
        error: JSON.stringify(result.partialFailureError).slice(0, 300),
      });
      return { success: false, partialFailureError: String(result.partialFailureError.message ?? result.partialFailureError) };
    }

    log("info", "google-ads.conversion_uploaded", {
      tenantId, orderId: data.orderId, amount: data.orderAmount, currency: data.currency,
    });

    return { success: true };
  } catch (err) {
    log("error", "google-ads.conversion_upload_error", {
      tenantId, orderId: data.orderId, error: String(err),
    });
    return { success: false, partialFailureError: String(err) };
  }
}

// ── Conversion Adjustment (Refunds) ────────────────────────────

export type ConversionAdjustmentData = {
  conversionActionId: string;
  orderId: string;              // must match original conversion orderId
  adjustmentType: "RETRACTION" | "RESTATEMENT";
  adjustmentDateTime: string;   // ISO string
  restatementValue?: number;    // for RESTATEMENT — new value in ören
  currency?: string;
};

/**
 * Upload a conversion adjustment (retraction or restatement) to Google Ads.
 * Used for refunds: RETRACTION removes the conversion value entirely.
 * Never throws — returns result.
 */
export async function uploadConversionAdjustment(
  tenantId: string,
  customerId: string,
  data: ConversionAdjustmentData,
): Promise<ConversionUploadResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantId);
  } catch (err) {
    log("error", "google-ads.adjustment_token_failed", {
      tenantId, orderId: data.orderId, error: String(err),
    });
    return { success: false, partialFailureError: "OAuth-token ogiltig" };
  }

  const conversionAction = `customers/${customerId}/conversionActions/${data.conversionActionId}`;

  const adjustment: Record<string, unknown> = {
    conversionAction,
    orderId: data.orderId,
    adjustmentType: data.adjustmentType,
    adjustmentDateTime: toGoogleDateTime(data.adjustmentDateTime),
  };

  if (data.adjustmentType === "RESTATEMENT" && data.restatementValue !== undefined) {
    adjustment.restatementValue = {
      adjustedValue: parseFloat(orenToDecimal(data.restatementValue)),
      currencyCode: data.currency ?? "SEK",
    };
  }

  try {
    const cleanCustomerId = customerId.replace(/-/g, "");
    const url = `${GOOGLE_ADS_API}/customers/${cleanCustomerId}:uploadConversionAdjustments`;

    const res = await resilientFetch(url, {
      service: "google-ads", timeout: 8_000,
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
      body: JSON.stringify({
        conversionAdjustments: [adjustment],
        partialFailure: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      log("error", "google-ads.adjustment_upload_failed", {
        tenantId, orderId: data.orderId, status: res.status, body: text.slice(0, 300),
      });
      return { success: false, partialFailureError: `HTTP ${res.status}` };
    }

    const result = await res.json();
    if (result.partialFailureError) {
      return { success: false, partialFailureError: String(result.partialFailureError.message ?? result.partialFailureError) };
    }

    log("info", "google-ads.adjustment_uploaded", {
      tenantId, orderId: data.orderId, type: data.adjustmentType,
    });
    return { success: true };
  } catch (err) {
    log("error", "google-ads.adjustment_upload_error", {
      tenantId, orderId: data.orderId, error: String(err),
    });
    return { success: false, partialFailureError: String(err) };
  }
}
