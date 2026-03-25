/**
 * Payment Provider Config Resolution
 * ═══════════════════════════════════
 *
 * Maps tenant → active PaymentAdapter + decrypted credentials.
 * This is the ONLY place in the codebase that resolves which provider a tenant uses.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getPaymentAdapter } from "./registry";
import { decryptProviderCredentials, encryptProviderCredentials } from "./credentials";
import type { PaymentAdapter, PaymentAdapterContext } from "./types";

/**
 * Returns the active PaymentAdapter AND decrypted credentials for a tenant.
 * This is the primary entry point — use this instead of getAdapterForTenant.
 */
export async function getAdapterAndContextForTenant(tenantId: string): Promise<{
  adapter: PaymentAdapter;
  ctx: PaymentAdapterContext;
}> {
  const config = await prisma.tenantPaymentConfig.findUnique({
    where: { tenantId },
  });

  const providerKey = config?.providerKey ?? "bedfront_payments";
  const adapter = getPaymentAdapter(providerKey);

  const credentials = config?.credentials
    ? decryptProviderCredentials(config.credentials as string)
    : {};

  return {
    adapter,
    ctx: { tenantId, credentials },
  };
}

/**
 * Returns the active PaymentAdapter for a tenant (without credentials).
 * Prefer getAdapterAndContextForTenant when you need to call adapter methods.
 */
export async function getAdapterForTenant(tenantId: string): Promise<PaymentAdapter> {
  const { adapter } = await getAdapterAndContextForTenant(tenantId);
  return adapter;
}

/**
 * Set the active payment adapter for a tenant.
 * Validates providerKey against the registry BEFORE writing to DB.
 * Encrypts credentials at rest.
 */
export async function setAdapterForTenant(
  tenantId: string,
  providerKey: string,
  credentials?: Record<string, string>,
  configuredBy?: string,
): Promise<void> {
  // Validate providerKey is registered — throws if not
  getPaymentAdapter(providerKey);

  const encryptedCredentials = credentials
    ? encryptProviderCredentials(credentials)
    : undefined;

  await prisma.tenantPaymentConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      providerKey,
      credentials: encryptedCredentials,
      configuredBy,
    },
    update: {
      providerKey,
      credentials: encryptedCredentials,
      configuredBy,
    },
  });
}
