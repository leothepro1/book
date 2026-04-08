/**
 * Adapter Resolution
 *
 * The ONLY function platform code calls to get an adapter.
 * No page, component, or API route ever calls getAdapter() directly.
 *
 * Resolution logic:
 *   1. Query TenantIntegration for this tenant
 *   2. If none exists or status !== "active", return ManualAdapter
 *   3. Otherwise, decrypt credentials and return the provider's adapter
 */

import type { PmsAdapter } from "./adapter";
import type { PmsProvider } from "./types";
import { getAdapter } from "./registry";
import { decryptCredentials } from "./crypto";
import { prisma } from "@/app/_lib/db/prisma";

export async function resolveAdapter(tenantId: string): Promise<PmsAdapter> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId },
  });

  if (!integration || integration.status !== "active") {
    return getAdapter("manual");
  }

  const provider = integration.provider as PmsProvider;

  if (provider === "manual") {
    return getAdapter("manual");
  }

  // If no encrypted credentials stored, fall back to FakeAdapter
  // (demo environment without real PMS credentials)
  if (!integration.credentialsEncrypted) {
    return getAdapter("fake", { scenario: "happy", delayMs: "200" });
  }

  // Decrypt credentials and use the real adapter — even in demo mode,
  // real credentials take precedence so testConnection() hits the PMS.
  const credentials = decryptCredentials(
    Buffer.from(integration.credentialsEncrypted),
    Buffer.from(integration.credentialsIv),
  );

  return getAdapter(provider, credentials);
}
