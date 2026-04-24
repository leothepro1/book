"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAdapter } from "@/app/_lib/integrations/registry";
import { invalidateAdapterCache } from "@/app/_lib/integrations/resolve";
import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";
import { PmsProviderSchema } from "@/app/_lib/integrations/types";
import type { PmsProvider } from "@/app/_lib/integrations/types";
import { getMewsDemoCredentials } from "@/app/_lib/integrations/adapters/mews/demo-credentials";

/**
 * Dev-only: the admin "Fake PMS" option reroutes to a real Mews demo
 * connection so the dev tenant mirrors the operator's private Mews
 * demo hotel. Platform-side Mews fields (clientToken, clientName,
 * webhookSecret) reuse the public demo-env identity; the hotel-
 * specific accessToken comes from DEV_MEWS_DEMO_ACCESS_TOKEN in
 * .env.local. Returns null when the env var is missing so the caller
 * can fall back to the synthetic FakeAdapter behaviour.
 */
function resolveFakeAsMewsDemo(): {
  provider: PmsProvider;
  credentials: Record<string, string>;
} | null {
  if (process.env.NODE_ENV === "production") return null;
  const accessToken = process.env.DEV_MEWS_DEMO_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;
  const demo = getMewsDemoCredentials();
  return {
    provider: "mews",
    credentials: {
      clientToken: demo.clientToken,
      accessToken,
      clientName: demo.clientName,
      webhookSecret: demo.webhookSecret,
      enterpriseId: demo.enterpriseId,
      useDemoEnvironment: "true",
      initialSyncDays: String(demo.initialSyncDays),
    },
  };
}

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

  // Swap "Fake PMS" for the operator's private Mews demo hotel when
  // the env-sourced access token is available. Keeps the button label
  // unchanged but tests the real Mews API.
  let resolvedProvider: PmsProvider = providerResult.data;
  let resolvedCredentials: Record<string, string> = credentials;
  if (resolvedProvider === "fake") {
    const aliased = resolveFakeAsMewsDemo();
    if (aliased) {
      resolvedProvider = aliased.provider;
      resolvedCredentials = aliased.credentials;
    }
  }

  try {
    const adapter = getAdapter(resolvedProvider, resolvedCredentials);
    const result = await adapter.testConnection(resolvedCredentials);
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
  let validProvider: PmsProvider = providerResult.data;
  let resolvedCredentials: Record<string, string> = credentials;

  if (validProvider === "manual") {
    return { ok: false, error: "Manuell leverantör kan inte kopplas in" };
  }

  if (validProvider === "fake" && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Fake-leverantör är inte tillgänglig i produktion" };
  }

  // Swap "Fake PMS" → real Mews demo connection when the operator has
  // set DEV_MEWS_DEMO_ACCESS_TOKEN. The saved TenantIntegration row
  // stores provider="mews" so `resolveAdapter()` later uses the real
  // MewsAdapter with the operator's hotel credentials, not the
  // synthetic FakeAdapter. Falls back to synthetic fake when the env
  // var is missing so the option still works for bare dev setups.
  if (validProvider === "fake") {
    const aliased = resolveFakeAsMewsDemo();
    if (aliased) {
      validProvider = aliased.provider;
      resolvedCredentials = aliased.credentials;
    }
  }

  // Test connection first
  try {
    const adapter = getAdapter(validProvider, resolvedCredentials);
    const testResult = await adapter.testConnection(resolvedCredentials);
    if (!testResult.ok) {
      return { ok: false, error: testResult.error ?? "Anslutningen misslyckades" };
    }
  } catch (error) {
    console.error("[connectIntegration] Test connection error:", error);
    return { ok: false, error: "Anslutningen misslyckades — försök igen" };
  }

  // Encrypt and save
  const { encrypted, iv } = encryptCredentials(resolvedCredentials);

  const encryptedBytes = new Uint8Array(encrypted);
  const ivBytes = new Uint8Array(iv);

  const isDemoEnvironment = resolvedCredentials.useDemoEnvironment === "true";

  await prisma.tenantIntegration.upsert({
    where: { tenantId: tenant.tenant.id },
    create: {
      tenantId: tenant.tenant.id,
      provider: validProvider,
      credentialsEncrypted: encryptedBytes,
      credentialsIv: ivBytes,
      status: "active",
      consecutiveFailures: 0,
      externalTenantId: resolvedCredentials.enterpriseId || null,
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
      externalTenantId: resolvedCredentials.enterpriseId || null,
      isDemoEnvironment,
    },
  });

  // Invalidate the adapter cache so the very next webhook or
  // reconcile call uses the new credentials. Without this, up to
  // 60 s after a credential rotation would still run through the
  // old (possibly revoked) adapter instance — causing cascading
  // adapter failures and a spuriously tripped circuit breaker.
  invalidateAdapterCache(tenant.tenant.id);

  // Fire-and-forget: auto-sync accommodations from the PMS on connect.
  // The previous call site here used the deprecated syncPmsProducts
  // stub which returned 0 created / 0 updated unconditionally — no
  // accommodation rows were ever created from the connected hotel.
  // syncAccommodations is the real engine: it calls adapter.getRoomTypes
  // against the live PMS, upserts Accommodation rows, and seeds
  // AccommodationCategory + physical-unit rows in one pass.
  import("@/app/_lib/accommodations")
    .then(({ syncAccommodations }) => syncAccommodations(tenant.tenant.id))
    .then((r) =>
      console.log(
        `[accommodations-sync] Auto-sync on connect: ${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped} skipped, ${r.errors.length} errors`,
      ),
    )
    .catch((err) =>
      console.error("[accommodations-sync] Auto-sync on connect failed:", err),
    );

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

  // Drop the cached adapter so subsequent resolveAdapter() calls
  // see status="disconnected" and fall back to ManualAdapter rather
  // than keep hitting the disconnected provider for up to 60 s.
  invalidateAdapterCache(tenant.tenant.id);

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

    // Status flipped — invalidate any cached adapter so resolveAdapter
    // picks up the new status (active ↔ error) on the very next call
    // rather than waiting for the 60 s TTL to expire.
    invalidateAdapterCache(tenant.tenant.id);

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
