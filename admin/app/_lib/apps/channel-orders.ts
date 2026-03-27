/**
 * Channel Order Ingestion
 * ═══════════════════════
 *
 * Creates orders from external sales channels (OTAs like Booking.com, Expedia).
 * Handles idempotency via sourceChannel + sourceExternalId dedup.
 * OTA orders arrive pre-paid — created directly as PAID.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { log } from "@/app/_lib/logger";

// ── Input / Output types ─────────────────────────────────────

export interface ChannelOrderInput {
  tenantId: string;
  channelHandle: string;        // "booking_com"
  sourceExternalId: string;     // OTA's booking reference e.g. "BK-12345678"
  sourceUrl?: string;           // link to order on OTA platform
  guestEmail: string;
  guestName: string;
  guestPhone?: string;
  checkIn: string;              // ISO date "2025-08-01"
  checkOut: string;             // ISO date "2025-08-05"
  roomCategoryName: string;     // snapshot — name of room type
  ratePlanName?: string;        // snapshot — rate plan name
  totalAmount: number;          // in smallest currency unit (ören)
  currency: string;             // "SEK" | "EUR" etc.
  metadata?: Record<string, unknown>;
}

export interface ChannelOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: number;
  alreadyExists?: boolean;      // true if duplicate — return 200 not 201
  error?: string;
}

// ── Main function ────────────────────────────────────────────

export async function createChannelOrder(
  input: ChannelOrderInput,
): Promise<ChannelOrderResult> {
  const {
    tenantId, channelHandle, sourceExternalId, sourceUrl,
    guestEmail, guestName, guestPhone,
    checkIn, checkOut, roomCategoryName, ratePlanName,
    totalAmount, currency, metadata,
  } = input;

  try {
    // ── Idempotency check ───────────────────────────────────
    const existing = await prisma.order.findFirst({
      where: {
        tenantId,
        sourceChannel: channelHandle,
        sourceExternalId,
      },
      select: { id: true, orderNumber: true },
    });

    if (existing) {
      log("info", "channel.order.duplicate", {
        tenantId, channelHandle, sourceExternalId,
        orderId: existing.id,
      });
      return {
        success: true,
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        alreadyExists: true,
      };
    }

    // ── Atomic order creation ───────────────────────────────
    const orderNumber = await nextOrderNumber(tenantId);

    const order = await prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          tenantId,
          orderNumber,
          status: "PAID",
          orderType: "ACCOMMODATION",
          paymentMethod: "INVOICE",
          guestEmail,
          guestName,
          guestPhone: guestPhone ?? null,
          sourceChannel: channelHandle,
          sourceExternalId,
          sourceUrl: sourceUrl ?? null,
          subtotalAmount: totalAmount,
          taxAmount: 0,
          taxRate: 0,
          totalAmount,
          currency,
          paidAt: new Date(),
          metadata: {
            checkIn,
            checkOut,
            ...(metadata ?? {}),
          },
          lineItems: {
            create: {
              productId: `external:${channelHandle}`,
              variantId: null,
              title: roomCategoryName,
              variantTitle: ratePlanName ?? null,
              sku: null,
              imageUrl: null,
              quantity: 1,
              unitAmount: totalAmount,
              totalAmount,
              currency,
            },
          },
          events: {
            create: {
              type: "CHANNEL_ORDER_RECEIVED",
              message: `Bokning mottagen från ${channelHandle} (${sourceExternalId})`,
              metadata: { channelHandle, sourceExternalId },
            },
          },
        },
      });
    });

    log("info", "channel.order.received", {
      tenantId, channelHandle, sourceExternalId,
      orderId: order.id, orderNumber: order.orderNumber,
    });

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "channel.order.failed", {
      tenantId, channelHandle, sourceExternalId, error: message,
    });
    return { success: false, error: message };
  }
}
