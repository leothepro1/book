/**
 * Mews Demo Credentials
 *
 * Publicly documented demo credentials for the Mews sandbox environment.
 * Used ONLY for local development and integration tests.
 * Production credentials come from TenantIntegration.credentialsEncrypted.
 */

import type { MewsCredentials } from "./credentials";

export function getMewsDemoCredentials(): MewsCredentials {
  return {
    clientToken:
      "E0D439EE522F44368DC78E1BFB03710C-D24FB11DBE31D4621C4817E028D9E1D",
    accessToken:
      "C66EF7B239D24632943D115EDE9CB810-EA00F8FD8294692C940F6B5A8F9453D",
    clientName: "GuestPortalPlatform/1.0.0",
    webhookSecret: "demo-webhook-secret",
    enterpriseId: "",
    useDemoEnvironment: true,
    initialSyncDays: 90,
  };
}
