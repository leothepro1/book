export const dynamic = "force-dynamic";

/**
 * Expedia Order Ingestion Webhook
 * ════════════════════════════════
 *
 * POST /api/apps/expedia/orders
 *
 * Called by Expedia to push new bookings into Bedfront.
 * HMAC-SHA256 signature verification on every request.
 * Idempotent — duplicate booking_id returns 200, not error.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createChannelOrder } from "@/app/_lib/apps/channel-orders";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { timingSafeEqual, createHmac } from "crypto";

// ── Zod schema ──────────────────────────────────────────────

const expediaPayloadSchema = z.object({
  booking_id: z.string().min(1),
  itinerary_id: z.string().optional(),
  property_id: z.string().min(1),
  guest_email: z.string().email(),
  guest_name: z.string().min(1),
  guest_phone: z.string().optional(),
  check_in: z.string().min(1),
  check_out: z.string().min(1),
  room_type: z.string().min(1),
  rate_plan: z.string().optional(),
  total_amount: z.number().int().positive(),
  currency: z.string().length(3),
  booking_url: z.string().url().optional(),
  tenant_portal_slug: z.string().min(1),
});

// ── Signature verification ──────────────────────────────────

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Handler ─────────────────────────────────────────────────

export async function POST(req: Request) {
  const secret = process.env.EXPEDIA_WEBHOOK_SECRET;
  if (!secret) {
    log("error", "expedia.webhook.misconfigured", {});
    return NextResponse.json(
      { status: "error", error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  // ── Signature check ─────────────────────────────────────
  const rawBody = await req.text();
  const signature = req.headers.get("x-expedia-signature") ?? "";

  if (!signature || !verifySignature(rawBody, signature, secret)) {
    log("warn", "expedia.webhook.signature_failed", {});
    return NextResponse.json(
      { status: "error", error: "Invalid signature" },
      { status: 401 },
    );
  }

  // ── Parse + validate ────────────────────────────────────
  let body: z.infer<typeof expediaPayloadSchema>;
  try {
    body = expediaPayloadSchema.parse(JSON.parse(rawBody));
  } catch {
    log("warn", "expedia.webhook.invalid_payload", {});
    return NextResponse.json(
      { status: "error", error: "Invalid payload" },
      { status: 400 },
    );
  }

  // ── Resolve tenant ──────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { portalSlug: body.tenant_portal_slug },
    select: { id: true },
  });

  if (!tenant) {
    log("warn", "expedia.webhook.tenant_not_found", {
      portalSlug: body.tenant_portal_slug,
    });
    return NextResponse.json(
      { status: "error", error: "Tenant not found" },
      { status: 404 },
    );
  }

  // ── Verify app is installed and active ──────────────────
  const tenantApp = await prisma.tenantApp.findUnique({
    where: {
      tenantId_appId: { tenantId: tenant.id, appId: "expedia" },
    },
    select: { status: true },
  });

  if (!tenantApp || tenantApp.status !== "ACTIVE") {
    log("warn", "expedia.webhook.app_not_active", {
      tenantId: tenant.id,
    });
    return NextResponse.json(
      { status: "error", error: "Expedia app not active for this tenant" },
      { status: 403 },
    );
  }

  // ── Resolve product by room type ───────────────────────
  const product = await prisma.product.findFirst({
    where: { tenantId: tenant.id, title: body.room_type, status: "ACTIVE" },
    select: { id: true },
  });

  // ── Create channel order ────────────────────────────────
  const result = await createChannelOrder({
    tenantId: tenant.id,
    channelHandle: "expedia",
    sourceExternalId: body.booking_id,
    sourceUrl: body.booking_url,
    productId: product?.id,
    guestEmail: body.guest_email,
    guestName: body.guest_name,
    guestPhone: body.guest_phone,
    checkIn: body.check_in,
    checkOut: body.check_out,
    roomCategoryName: body.room_type,
    ratePlanName: body.rate_plan,
    totalAmount: body.total_amount,
    currency: body.currency,
    metadata: body.itinerary_id ? { itineraryId: body.itinerary_id } : undefined,
  });

  if (result.alreadyExists) {
    return NextResponse.json({
      status: "already_processed",
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    });
  }

  if (result.success) {
    return NextResponse.json(
      {
        status: "created",
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      },
      { status: 201 },
    );
  }

  // Return 200 even on error — prevent OTA retry storms
  return NextResponse.json({
    status: "error",
    error: result.error,
  });
}
