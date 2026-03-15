// FakeLockAdapter — används i dev och test. Gör inga nätverksanrop.
// Byt ut mot SaltoAdapter när Salto Nebula sandbox-credentials finns.

import { z } from "zod";
import type { LockAdapter } from "../../lock/adapter";
import type {
  LockProvider,
  CreateKeyParams,
  NormalizedKey,
  ConnectionResult,
} from "../../lock/types";

// ── Credentials ─────────────────────────────────────────────

export const FakeLockCredentialsSchema = z.object({
  scenario: z.enum(["happy", "error"]).default("happy"),
});

export type FakeLockCredentials = z.infer<typeof FakeLockCredentialsSchema>;

// ── Adapter ─────────────────────────────────────────────────

export class FakeLockAdapter implements LockAdapter {
  readonly provider: LockProvider = "fake";
  private readonly config: FakeLockCredentials;

  constructor(config: FakeLockCredentials) {
    this.config = config;
  }

  async createKey(params: CreateKeyParams): Promise<NormalizedKey> {
    if (this.config.scenario === "error") {
      throw new Error("FakeLockAdapter: simulated createKey failure");
    }

    const keyId = `fake_key_${params.bookingId}_${Date.now()}`;

    return {
      keyId,
      provider: "fake",
      validFrom: params.validFrom,
      validTo: params.validTo,
      status: "active",
      walletPayload: {
        passTypeIdentifier: "pass.com.bedfront.dev",
        serialNumber: keyId,
        authenticationToken: `fake_auth_${keyId}`,
        passData: {
          roomNumber: params.roomIdentifier,
          guestName: params.guestName,
          hotelName: "Dev Hotel",
        },
      },
      portalPayload: {
        qrCode: `FAKE_QR_${keyId}`,
        deepLink: null,
        displayText: `Rum ${params.roomIdentifier} — giltig ${params.validFrom.toISOString().slice(0, 10)} till ${params.validTo.toISOString().slice(0, 10)}`,
      },
    };
  }

  async revokeKey(keyId: string, _tenantId: string): Promise<void> {
    console.log(`FakeLockAdapter: revokeKey called for ${keyId}`);
  }

  async testConnection(_credentials: Record<string, string>): Promise<ConnectionResult> {
    if (this.config.scenario === "error") {
      return { success: false, providerName: "Fake Lock", reason: "Simulerat fel" };
    }
    return { success: true, providerName: "Fake Lock", reason: null };
  }
}
