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
import { getSalesChannelByHandle } from "./registry";

export class ChannelOrderError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ChannelOrderError";
    this.code = code;
  }
}

// ── Input / Output types ─────────────────────────────────────

export interface ChannelOrderInput {
  tenantId: string;
  channelHandle: string;        // "booking_com"
  sourceExternalId: string;     // OTA's booking reference e.g. "BK-12345678"
  sourceUrl?: string;           // link to order on OTA platform
  productId?: string;           // Bedfront product ID — validated against channel publication
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
    tenantId, channelHandle, sourceExternalId, sourceUrl, productId,
    guestEmail, guestName, guestPhone,
    checkIn, checkOut, roomCategoryName, ratePlanName,
    totalAmount, currency, metadata,
  } = input;

  const channelApp = getSalesChannelByHandle(channelHandle);
  const displayName = channelApp?.salesChannel?.displayName ?? channelHandle;

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

    // ── Publication check ───────────────────────────────────
    if (productId) {
      const publication = await prisma.productChannelPublication.findFirst({
        where: {
          tenantId,
          productId,
          channelHandle,
          unpublishedAt: null,
        },
      });

      if (!publication) {
        throw new ChannelOrderError(
          `Product ${productId} is not published to channel ${channelHandle}`,
          "PRODUCT_NOT_PUBLISHED",
        );
      }
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
              productId: productId ?? `external:${channelHandle}`,
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
              tenantId,
              type: "CHANNEL_ORDER_RECEIVED",
              message: `Bokning mottagen från ${displayName} — extern ref: ${sourceExternalId}`,
              metadata: { channelHandle, sourceExternalId, sourceUrl: sourceUrl ?? null },
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
    if (err instanceof ChannelOrderError) {
      log("warn", "channel.order.rejected", {
        tenantId, channelHandle, sourceExternalId, code: err.code, error: err.message,
      });
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    log("error", "channel.order.failed", {
      tenantId, channelHandle, sourceExternalId, error: message,
    });
    return { success: false, error: message };
  }
}

// ── Product Channel Publication ─────────────────────────────

export async function publishProductToChannel(
  tenantId: string,
  productId: string,
  channelHandle: string,
): Promise<void> {
  await prisma.productChannelPublication.upsert({
    where: {
      tenantId_productId_channelHandle: { tenantId, productId, channelHandle },
    },
    create: { tenantId, productId, channelHandle, publishedAt: new Date() },
    update: { unpublishedAt: null, publishedAt: new Date() },
  });
}

export async function unpublishProductFromChannel(
  tenantId: string,
  productId: string,
  channelHandle: string,
): Promise<void> {
  await prisma.productChannelPublication.updateMany({
    where: { tenantId, productId, channelHandle, unpublishedAt: null },
    data: { unpublishedAt: new Date() },
  });
}

export async function getPublishedProducts(
  tenantId: string,
  channelHandle: string,
): Promise<string[]> {
  const rows = await prisma.productChannelPublication.findMany({
    where: { tenantId, channelHandle, unpublishedAt: null },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
}
