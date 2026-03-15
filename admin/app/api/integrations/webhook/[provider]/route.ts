/**
 * PMS Webhook Receiver
 *
 * POST /api/integrations/webhook/[provider]?token=SECRET
 *
 * Receives webhook events from external PMS systems.
 * Enqueues a SyncJob and returns 200 immediately — never blocks.
 *
 * Security:
 * - Signature verified BEFORE processing (Mews: URL query token)
 * - Tenant resolved from PMS-specific payload identifier
 * - Idempotency enforced via database unique constraint (WebhookDedup)
 *
 * Error handling:
 * - Invalid signature → 401
 * - Unknown provider → 404
 * - Cannot resolve tenant → 400
 * - Processing errors → 200 (never return 5xx to a PMS — they retry endlessly)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { PmsProviderSchema } from "@/app/_lib/integrations/types";
import type { PmsProvider } from "@/app/_lib/integrations/types";
import { getAdapter } from "@/app/_lib/integrations/registry";
import { decryptCredentials } from "@/app/_lib/integrations/crypto";
import { enqueueSyncJob } from "@/app/_lib/integrations/sync/scheduler";
import { logSyncEvent } from "@/app/_lib/integrations/sync/log";
import { MewsWebhookPayloadSchema } from "@/app/_lib/integrations/adapters/mews/mews-types";

/**
 * Provider-specific webhook tenant resolution.
 * Extracts the PMS's property identifier from the payload
 * without needing an adapter instance (avoids credential requirement).
 */
function resolveWebhookTenantId(provider: PmsProvider, body: unknown): string | null {
  switch (provider) {
    case "mews": {
      const parsed = MewsWebhookPayloadSchema.safeParse(body);
      return parsed.success ? parsed.data.EnterpriseId : null;
    }
    default:
      return null;
  }
}

/**
 * Provider-specific webhook signature verification.
 * Mews uses a URL query token, not cryptographic signing.
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

  // Manual provider does not receive webhooks
  if (provider === "manual") {
    return NextResponse.json({ error: "Manual provider does not accept webhooks" }, { status: 404 });
  }

  try {
    // Read raw body BEFORE parsing
    const rawBody = Buffer.from(await request.arrayBuffer());
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Extract URL query token (Mews signature mechanism)
    headers["x-forwarded-token"] = request.nextUrl.searchParams.get("token") ?? "";

    // 2. Parse body
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 3. Resolve which tenant this webhook is for
    const externalTenantId = resolveWebhookTenantId(provider, body);
    if (!externalTenantId) {
      return NextResponse.json({ error: "Cannot resolve tenant from payload" }, { status: 400 });
    }

    const integration = await prisma.tenantIntegration.findFirst({
      where: {
        provider,
        externalTenantId,
        status: "active",
      },
    });

    if (!integration) {
      return NextResponse.json({ received: true, processed: false });
    }

    // 4. Verify webhook signature using decrypted credentials
    const credentials = decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );

    if (!verifySignature(provider, headers, credentials)) {
      await logSyncEvent(
        integration.tenantId,
        provider,
        "connection.failed",
        { error: "Invalid webhook signature" },
        undefined,
        "Invalid webhook signature",
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 5. Idempotency — database-level unique constraint on dedupKey
    const webhookId = (body as Record<string, unknown>)?.webhookId
      ?? (body as Record<string, unknown>)?.id
      ?? null;

    if (typeof webhookId === "string") {
      const dedupKey = `${provider}:${webhookId}`;

      try {
        await prisma.webhookDedup.create({
          data: {
            dedupKey,
            provider,
            tenantId: integration.tenantId,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json({ received: true, duplicate: true });
        }
        throw error;
      }
    }

    // 6. Enqueue sync job (has built-in dedup)
    await enqueueSyncJob(integration.tenantId, provider);

    return NextResponse.json({ received: true, enqueued: true });
  } catch (error) {
    // Never return 5xx to a PMS webhook
    console.error(`[Webhook/${rawProvider}] Processing error:`, error);
    return NextResponse.json({ received: true, error: "processing_failed" });
  }
}
