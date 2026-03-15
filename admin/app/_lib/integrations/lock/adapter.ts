import type {
  LockProvider,
  CreateKeyParams,
  NormalizedKey,
  ConnectionResult,
} from "./types";

/**
 * LockAdapter — interface for digital lock providers.
 *
 * Every lock provider (Salto, Assa Abloy, Nuki, etc.) implements this
 * interface. Platform code calls resolveLockAdapter(tenantId) and works
 * with the returned adapter — never calls lock APIs directly.
 *
 * Follows same pattern as PmsAdapter in app/_lib/integrations/adapter.ts.
 */
export interface LockAdapter {
  readonly provider: LockProvider;

  /** Create a digital key for a guest's booking. */
  createKey(params: CreateKeyParams): Promise<NormalizedKey>;

  /** Revoke a previously issued key. */
  revokeKey(keyId: string, tenantId: string): Promise<void>;

  /** Test connection with credentials. */
  testConnection(credentials: Record<string, string>): Promise<ConnectionResult>;

  /** Verify webhook signature (optional — not all providers use webhooks). */
  verifyWebhookSignature?(
    payload: Buffer,
    signature: string,
    secret: string,
  ): boolean;
}
