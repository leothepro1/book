/**
 * Google Ads — GA4 Measurement Protocol (Server-Side)
 *
 * sendGA4PurchaseEvent() sends a purchase event to GA4 via Measurement Protocol.
 * Never throws — returns result, caller decides.
 * Used for confirmed server-side purchases where we have order data.
 */

import { resilientFetch } from "@/app/_lib/http/fetch";
import { log } from "@/app/_lib/logger";

// ── Types ───────────────────────────────────────────────────────

export interface GA4PurchaseEvent {
  tenantId: string;
  measurementId: string;     // G-XXXXXXXXXX
  apiSecret: string;         // GA4 Measurement Protocol API secret
  clientId: string;          // from _ga cookie or generated
  orderId: string;
  orderNumber: number;
  totalAmount: number;       // in ören
  currency: string;
  items: Array<{
    itemId: string;
    itemName: string;
    price: number;           // in ören
    quantity: number;
  }>;
  gclid?: string;
}

export type GA4Result = {
  success: boolean;
  error?: string;
};

// ── Send Purchase Event ────────────────────────────────────────

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export async function sendGA4PurchaseEvent(
  event: GA4PurchaseEvent,
): Promise<GA4Result> {
  const url = `${GA4_ENDPOINT}?measurement_id=${event.measurementId}&api_secret=${event.apiSecret}`;

  const body = {
    client_id: event.clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: event.orderId,
          value: event.totalAmount / 100,
          currency: event.currency,
          items: event.items.map((item) => ({
            item_id: item.itemId,
            item_name: item.itemName,
            price: item.price / 100,
            quantity: item.quantity,
          })),
          ...(event.gclid ? { gclid: event.gclid } : {}),
        },
      },
    ],
  };

  try {
    const res = await resilientFetch(url, {
      service: "ga4",
      timeout: 5_000,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      log("error", "ga4.purchase_failed", {
        tenantId: event.tenantId,
        orderId: event.orderId,
        status: res.status,
        body: text.slice(0, 200),
      });
      return { success: false, error: `HTTP ${res.status}` };
    }

    log("info", "ga4.purchase_sent", {
      tenantId: event.tenantId,
      orderId: event.orderId,
      amount: event.totalAmount,
      currency: event.currency,
    });

    return { success: true };
  } catch (err) {
    log("error", "ga4.purchase_error", {
      tenantId: event.tenantId,
      orderId: event.orderId,
      error: String(err),
    });
    return { success: false, error: String(err) };
  }
}
