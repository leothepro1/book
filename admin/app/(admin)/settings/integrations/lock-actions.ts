"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";
import { resolveLockAdapter } from "@/app/_lib/integrations/lock/resolve";

// ── Types ──────────────────────────────────────────────────

export type LockIntegrationStatusResponse = {
  provider: string;
  status: string;
  lastTestedAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  maskedCredentials: Record<string, string>;
} | null;

// ── getLockIntegrationStatus ─────────────────────────────────

export async function getLockIntegrationStatus(): Promise<LockIntegrationStatusResponse> {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;

  const integration = await prisma.tenantLockIntegration.findUnique({
    where: { tenantId: tenant.tenant.id },
  });

  if (!integration) return null;

  // Decrypt and mask credentials for display
  const SENSITIVE_KEYS = new Set(["apiKey", "clientSecret"]);
  let maskedCredentials: Record<string, string> = {};
  try {
    if (integration.credentialsEncrypted && integration.credentialsIv) {
      const raw = decryptCredentials(
        Buffer.from(integration.credentialsEncrypted),
        Buffer.from(integration.credentialsIv),
      );
      maskedCredentials = Object.fromEntries(
        Object.entries(raw).map(([key, val]) => {
          if (SENSITIVE_KEYS.has(key)) return [key, "••••••••••••••••"];
          return [key, val];
        }),
      );
    }
  } catch {
    // Decryption failure — return empty
  }

  return {
    provider: integration.provider,
    status: integration.status,
    lastTestedAt: integration.lastTestedAt?.toISOString() ?? null,
    lastError: integration.lastError,
    consecutiveFailures: integration.consecutiveFailures,
    maskedCredentials,
  };
}

// ── getLockCredentialsForEdit ─────────────────────────────────

export async function getLockCredentialsForEdit(): Promise<Record<string, string> | null> {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;

  const integration = await prisma.tenantLockIntegration.findUnique({
    where: { tenantId: tenant.tenant.id },
  });

  if (!integration?.credentialsEncrypted || !integration?.credentialsIv) return null;

  try {
    return decryptCredentials(
      Buffer.from(integration.credentialsEncrypted),
      Buffer.from(integration.credentialsIv),
    );
  } catch {
    return null;
  }
}

// ── connectLockIntegration ───────────────────────────────────

export async function connectLockIntegration(
  provider: string,
  credentials: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  try {
    // Test connection first
    const { getLockAdapter } = await import("@/app/_lib/integrations/lock/registry");
    const adapter = getLockAdapter(provider as "fake" | "salto", credentials);
    const testResult = await adapter.testConnection(credentials);

    if (!testResult.success) {
      return { ok: false, error: testResult.reason ?? "Anslutningen misslyckades" };
    }

    // Encrypt credentials
    const { encrypted, iv } = encryptCredentials(credentials);

    // Upsert integration
    await prisma.tenantLockIntegration.upsert({
      where: { tenantId: tenant.tenant.id },
      create: {
        tenantId: tenant.tenant.id,
        provider: provider as "fake" | "salto" | "assa_abloy" | "nuki" | "manual",
        credentialsEncrypted: new Uint8Array(encrypted),
        credentialsIv: new Uint8Array(iv),
        status: "active",
        lastTestedAt: new Date(),
        consecutiveFailures: 0,
      },
      update: {
        provider: provider as "fake" | "salto" | "assa_abloy" | "nuki" | "manual",
        credentialsEncrypted: new Uint8Array(encrypted),
        credentialsIv: new Uint8Array(iv),
        status: "active",
        lastTestedAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
      },
    });

    // Log event
    const integrationRecord = await prisma.tenantLockIntegration.findUnique({
      where: { tenantId: tenant.tenant.id },
    });
    if (integrationRecord) {
      await prisma.keyEvent.create({
        data: {
          tenantId: tenant.tenant.id,
          integrationId: integrationRecord.id,
          eventType: "connection_tested",
          metadata: { provider, success: true },
        },
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[connectLockIntegration] Error:", error);
    return { ok: false, error: "Kunde inte ansluta — försök igen" };
  }
}

// ── testLockConnection ───────────────────────────────────────

export async function testLockConnection(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  try {
    const adapter = await resolveLockAdapter(tenant.tenant.id);
    const result = await adapter.testConnection({});

    // Update status based on result
    await prisma.tenantLockIntegration.update({
      where: { tenantId: tenant.tenant.id },
      data: {
        status: result.success ? "active" : "error",
        lastTestedAt: new Date(),
        lastError: result.reason,
        consecutiveFailures: result.success ? 0 : { increment: 1 },
      },
    });

    if (result.success) {
      return { ok: true };
    }
    return { ok: false, error: result.reason ?? "Anslutningstestet misslyckades" };
  } catch (error) {
    console.error("[testLockConnection] Error:", error);
    return { ok: false, error: "Kunde inte testa anslutningen" };
  }
}

// ── disconnectLockIntegration ────────────────────────────────

export async function disconnectLockIntegration(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Inte inloggad" };

  try {
    await prisma.tenantLockIntegration.update({
      where: { tenantId: tenant.tenant.id },
      data: {
        status: "disconnected",
        credentialsEncrypted: null,
        credentialsIv: null,
      },
    });

    // Log event
    const integrationRecord = await prisma.tenantLockIntegration.findUnique({
      where: { tenantId: tenant.tenant.id },
    });
    if (integrationRecord) {
      await prisma.keyEvent.create({
        data: {
          tenantId: tenant.tenant.id,
          integrationId: integrationRecord.id,
          eventType: "connection_failed",
          metadata: { reason: "disconnected_by_user" },
        },
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[disconnectLockIntegration] Error:", error);
    return { ok: false, error: "Kunde inte koppla från" };
  }
}
