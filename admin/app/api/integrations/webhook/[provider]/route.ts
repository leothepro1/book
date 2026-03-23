export const dynamic = "force-dynamic";

/**
 * PMS Webhook Receiver — Booking Engine
 *
 * POST /api/integrations/webhook/[provider]?token=SECRET
 *
 * Receives webhook events from external PMS systems.
 * In the booking engine architecture, webhooks are used for:
 *   - Cache invalidation (availability/rates changed)
 *   - Booking status updates (confirmation, cancellation)
 *   - Audit logging
 *
 * Security:
 * - Signature verified BEFORE processing
 * - Tenant resolved from PMS-specific payload identifier
 * - Idempotency enforced via database unique constraint (WebhookDedup)
 *
 * Error handling:
 * - Never return 5xx to a PMS — they retry endlessly
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { PmsProviderSchema } from "@/app/_lib/integrations/types";
import type { PmsProvider } from "@/app/_lib/integrations/types";
import { decryptCredentials } from "@/app/_lib/integrations/crypto";

/**
 * Provider-specific webhook signature verification.
 */
function verifySignature(
  provider: PmsProvider,
  headers: Record<string, string>,
  credentials: Record<string, string>,
): boolean {
  switch (provider) {
    case "mews": {
      const token = headers["x-forwarded-token"];
      const expected = credentials.webhookSecret;
      if (!token || !expected) return false;
      return token === expected;
    }
    default:
      return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;

  // 1. Validate provider
  const parsed = PmsProviderSchema.safeParse(rawProvider);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const provider: PmsProvider = parsed.data;

  if (provider === "manual") {
    return NextResponse.json({ error: "Manual provider does not accept webhooks" }, { status: 404 });
  }

  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });
    headers["x-forwarded-token"] = request.nextUrl.searchParams.get("token") ?? "";

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 2. Resolve tenant from payload
    const externalTenantId = (body as Record<string, unknown>)?.EnterpriseId as string | undefined;
    if (!externalTenantId) {
      return NextResponse.json({ error: "Cannot resolve tenant from payload" }, { status: 400 });
    }

    const integration = await prisma.tenantIntegration.findFirst({
      where: { provider, externalTenantId, status: "active" },
    });

    if (!integration) {
      return NextResponse.json({ received: true, processed: false });
    }

    // 3. Verify signature
    const credentials = decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );

    if (!verifySignature(provider, headers, credentials)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Idempotency
    const webhookId = (body as Record<string, unknown>)?.webhookId
      ?? (body as Record<string, unknown>)?.id
      ?? null;

    if (typeof webhookId === "string") {
      const dedupKey = `${provider}:${webhookId}`;
      try {
        await prisma.webhookDedup.create({
          data: { dedupKey, provider, tenantId: integration.tenantId },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return NextResponse.json({ received: true, duplicate: true });
        }
        throw error;
      }
    }

    // 5. Log the webhook event for audit
    await prisma.syncEvent.create({
      data: {
        tenantId: integration.tenantId,
        provider,
        eventType: "booking.modified",
        payload: body as Prisma.InputJsonValue,
      },
    });

    // TODO: Invalidate availability cache for this tenant when caching is implemented

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error(`[Webhook/${rawProvider}] Processing error:`, error);
    return NextResponse.json({ received: true, error: "processing_failed" });
  }
}
