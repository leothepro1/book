"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAdapter } from "@/app/_lib/integrations/registry";
import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";
import { enqueueSyncJob } from "@/app/_lib/integrations/sync/scheduler";
import { PmsProviderSchema } from "@/app/_lib/integrations/types";
import type { PmsProvider } from "@/app/_lib/integrations/types";

// ── Response types ──────────────────────────────────────────

export type IntegrationStatusResponse = {
  provider: string;
  status: string;
  lastSyncAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  externalTenantId: string | null;
  isDemoEnvironment: boolean;
  maskedCredentials: Record<string, string>;
} | null;

export type ActionResponse = {
  ok: boolean;
  error?: string;
};

export type SyncHistoryItem = {
  eventType: string;
  createdAt: string;
  error: string | null;
  bookingExternalId: string | null;
};

// ── getIntegrationStatus ────────────────────────────────────

export async function getIntegrationStatus(): Promise<IntegrationStatusResponse> {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;

  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: tenant.tenant.id },
  });

  if (!integration) return null;

  // Decrypt credentials for display — sensitive fields fully masked,
  // non-sensitive fields shown in cleartext
  const SENSITIVE_KEYS = new Set(["clientToken", "accessToken", "webhookSecret"]);
  let maskedCredentials: Record<string, string> = {};
  try {
    const raw = decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );
    maskedCredentials = Object.fromEntries(
      Object.entries(raw).map(([key, val]) => {
        if (SENSITIVE_KEYS.has(key)) {
          return [key, "••••••••••••••••"];
        }
        return [key, val];
      }),
    );
  } catch {
    // If decryption fails, return empty — don't crash
  }

  return {
    provider: integration.provider,
    status: integration.status,
    lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
    lastErrorAt: integration.lastErrorAt?.toISOString() ?? null,
    lastError: integration.lastError,
    consecutiveFailures: integration.consecutiveFailures,
    externalTenantId: integration.externalTenantId,
    isDemoEnvironment: integration.isDemoEnvironment,
    maskedCredentials,
  };
}

// ── testNewConnection ───────────────────────────────────────

export async function testNewConnection(
  provider: string,
  credentials: Record<string, string>,
): Promise<ActionResponse> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  const providerResult = PmsProviderSchema.safeParse(provider);
  if (!providerResult.success) {
    return { ok: false, error: "Okänd leverantör" };
  }

  try {
    const adapter = getAdapter(providerResult.data, credentials);
    const result = await adapter.testConnection(credentials);
    return result.ok
      ? { ok: true }
      : { ok: false, error: result.error ?? "Anslutningen misslyckades" };
  } catch (error) {
    console.error("[testNewConnection] Error:", error);
    return { ok: false, error: "Anslutningen misslyckades — kontrollera uppgifterna" };
  }
}

// ── getCredentialsForEdit ────────────────────────────────────

export async function getCredentialsForEdit(): Promise<Record<string, string> | null> {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;

  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: tenant.tenant.id },
  });

  if (!integration) return null;

  try {
    return decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );
  } catch {
    return null;
  }
}

// ── connectIntegration ──────────────────────────────────────

export async function connectIntegration(
  provider: string,
  credentials: Record<string, string>,
): Promise<ActionResponse> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  // Validate provider
  const providerResult = PmsProviderSchema.safeParse(provider);
  if (!providerResult.success) {
    return { ok: false, error: "Okänd leverantör" };
  }
  const validProvider: PmsProvider = providerResult.data;

  if (validProvider === "manual") {
    return { ok: false, error: "Manuell leverantör kan inte kopplas in" };
  }

  if (validProvider === "fake" && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Fake-leverantör är inte tillgänglig i produktion" };
  }

  // Test connection first
  try {
    const adapter = getAdapter(validProvider, credentials);
    const testResult = await adapter.testConnection(credentials);
    if (!testResult.ok) {
      return { ok: false, error: testResult.error ?? "Anslutningen misslyckades" };
    }
  } catch (error) {
    console.error("[connectIntegration] Test connection error:", error);
    return { ok: false, error: "Anslutningen misslyckades — försök igen" };
  }

  // Encrypt and save
  const { encrypted, iv } = encryptCredentials(credentials);

  const encryptedBytes = new Uint8Array(encrypted);
  const ivBytes = new Uint8Array(iv);

  const isDemoEnvironment = credentials.useDemoEnvironment === "true";

  await prisma.tenantIntegration.upsert({
    where: { tenantId: tenant.tenant.id },
    create: {
      tenantId: tenant.tenant.id,
      provider: validProvider,
      credentialsEncrypted: encryptedBytes,
      credentialsIv: ivBytes,
      status: "active",
      consecutiveFailures: 0,
      externalTenantId: credentials.enterpriseId || null,
      isDemoEnvironment,
    },
    update: {
      provider: validProvider,
      credentialsEncrypted: encryptedBytes,
      credentialsIv: ivBytes,
      status: "active",
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      externalTenantId: credentials.enterpriseId || null,
      isDemoEnvironment,
    },
  });

  // Enqueue initial sync
  await enqueueSyncJob(tenant.tenant.id, validProvider);

  return { ok: true };
}

// ── disconnectIntegration ───────────────────────────────────

export async function disconnectIntegration(): Promise<ActionResponse> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: tenant.tenant.id },
  });

  if (!integration) {
    return { ok: false, error: "Ingen integration hittades" };
  }

  await prisma.tenantIntegration.update({
    where: { tenantId: tenant.tenant.id },
    data: { status: "disconnected" },
  });

  // Cancel any pending/running sync jobs for this tenant
  await prisma.syncJob.updateMany({
    where: {
      tenantId: tenant.tenant.id,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "dead",
      lastError: "Integration disconnected by user",
    },
  });

  return { ok: true };
}

// ── testExistingConnection ──────────────────────────────────

export async function testExistingConnection(): Promise<ActionResponse> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId: tenant.tenant.id },
  });

  if (!integration) {
    return { ok: false, error: "Ingen integration hittades" };
  }

  try {
    const credentials = decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );

    const provider = integration.provider as PmsProvider;
    const adapter = getAdapter(provider, credentials);
    const result = await adapter.testConnection(credentials);

    await prisma.tenantIntegration.update({
      where: { tenantId: tenant.tenant.id },
      data: {
        status: result.ok ? "active" : "error",
        lastError: result.ok ? null : (result.error ?? "Anslutningen misslyckades"),
        lastErrorAt: result.ok ? null : new Date(),
        consecutiveFailures: result.ok ? 0 : integration.consecutiveFailures,
      },
    });

    return result.ok
      ? { ok: true }
      : { ok: false, error: result.error ?? "Anslutningen misslyckades" };
  } catch (error) {
    console.error("[testExistingConnection] Error:", error);
    return { ok: false, error: "Ett oväntat fel uppstod — försök igen" };
  }
}

// ── getSyncHistory ──────────────────────────────────────────

export async function getSyncHistory(): Promise<SyncHistoryItem[]> {
  const tenant = await getCurrentTenant();
  if (!tenant) return [];

  const events = await prisma.syncEvent.findMany({
    where: { tenantId: tenant.tenant.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      eventType: true,
      createdAt: true,
      error: true,
      bookingExternalId: true,
    },
  });

  return events.map((e) => ({
    eventType: e.eventType,
    createdAt: e.createdAt.toISOString(),
    error: e.error,
    bookingExternalId: e.bookingExternalId,
  }));
}
