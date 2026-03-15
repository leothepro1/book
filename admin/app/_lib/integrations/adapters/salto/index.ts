// SaltoAdapter — stub. Implementeras när Salto Nebula sandbox-credentials finns.
// API-docs: https://developer.saltosystems.com/nebula/api/

import { z } from "zod";
import type { LockAdapter } from "../../lock/adapter";
import type {
  LockProvider,
  CreateKeyParams,
  NormalizedKey,
  ConnectionResult,
} from "../../lock/types";

// ── Credentials ─────────────────────────────────────────────

export const SaltoCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  siteId: z.string().min(1),
});

export type SaltoCredentials = z.infer<typeof SaltoCredentialsSchema>;

// ── Adapter ─────────────────────────────────────────────────

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`SaltoAdapter.${method}() is not yet implemented`);
    this.name = "NotImplementedError";
  }
}

export class SaltoAdapter implements LockAdapter {
  readonly provider: LockProvider = "salto";

  constructor(_credentials: SaltoCredentials) {
    // Credentials will be used when methods are implemented
  }

  // POST /salto/nebula/accessright/v1 — skapa access right för gäst
  // POST /salto/nebula/destination/v1 — koppla mobile key destination
  async createKey(_params: CreateKeyParams): Promise<NormalizedKey> {
    throw new NotImplementedError("createKey");
  }

  // DELETE /salto/nebula/accessright/v1/{id} — återkalla access right
  async revokeKey(_keyId: string, _tenantId: string): Promise<void> {
    throw new NotImplementedError("revokeKey");
  }

  // GET /salto/nebula/accesspoint/v1 — lista access points för att verifiera credentials
  async testConnection(_credentials: Record<string, string>): Promise<ConnectionResult> {
    throw new NotImplementedError("testConnection");
  }
}
