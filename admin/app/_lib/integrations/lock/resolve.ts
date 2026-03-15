import { prisma } from "@/app/_lib/db/prisma";
import { decryptCredentials } from "../crypto";
import { getLockAdapter } from "./registry";
import type { LockAdapter } from "./adapter";
import type { LockProvider } from "./types";

/**
 * Resolves the correct LockAdapter for a tenant.
 *
 * - If no lock integration exists → returns FakeLockAdapter (never null, never throws)
 * - If integration exists but status !== "active" → returns FakeLockAdapter
 * - If integration is active → decrypts credentials, returns real adapter
 *
 * Follows same pattern as resolveAdapter() in resolve.ts (PMS layer).
 */
export async function resolveLockAdapter(tenantId: string): Promise<LockAdapter> {
  const integration = await prisma.tenantLockIntegration.findUnique({
    where: { tenantId },
  });

  // No integration or inactive → fallback to fake
  if (!integration || integration.status !== "active") {
    return getLockAdapter("manual");
  }

  const provider = integration.provider as LockProvider;

  // Manual/fake → no credentials needed
  if (provider === "manual" || provider === "fake") {
    return getLockAdapter(provider);
  }

  // Real lock providers → decrypt credentials
  if (!integration.credentialsEncrypted || !integration.credentialsIv) {
    return getLockAdapter("manual");
  }

  const credentials = decryptCredentials(
    Buffer.from(integration.credentialsEncrypted),
    Buffer.from(integration.credentialsIv),
  );

  return getLockAdapter(provider, credentials);
}
