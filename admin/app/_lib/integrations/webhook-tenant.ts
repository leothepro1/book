/**
 * Webhook → Tenant Resolution (credential-free)
 * ════════════════════════════════════════════════
 *
 * The PMS webhook route needs to know which tenant owns a delivery
 * BEFORE it can fetch that tenant's credentials to verify the
 * signature. Adapter instance methods like resolveWebhookTenant()
 * require credentials to be instantiated (Mews throws), so we factor
 * the stateless, signature-free part out into this module.
 *
 * Adding a new PMS provider: add a case here AND implement
 * verifyWebhookSignature + parseWebhookEvents on the adapter.
 *
 * Security note: nothing here can be spoofed safely — a malicious
 * payload can claim any EnterpriseId. The signature check downstream
 * is what binds the payload to a tenant. Tenant resolution is a
 * lookup, not an authorisation step.
 */

import type { PmsProvider } from "./types";

export function resolveWebhookExternalTenant(
  provider: PmsProvider,
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  switch (provider) {
    case "mews": {
      // Mews webhook payloads carry EnterpriseId at the root.
      return typeof p.EnterpriseId === "string" ? p.EnterpriseId : null;
    }
    case "fake": {
      // FakeAdapter uses the hardcoded "fake-enterprise-id" for all
      // dev traffic. Accept that literal, or any explicit
      // enterpriseId property in the payload for test flexibility.
      if (typeof p.enterpriseId === "string") return p.enterpriseId;
      return "fake-enterprise-id";
    }
    case "manual":
    case "apaleo":
    case "opera":
      // Manual has no webhooks. Apaleo/Opera not implemented yet.
      return null;
  }
}
