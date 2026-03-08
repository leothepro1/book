import type {
  AccessPass,
  AccessPassType,
  AccessPassStatus,
  AccessPassEvent,
  AccessPassEventType,
} from "@prisma/client";

// Re-export Prisma types for convenience
export type { AccessPass, AccessPassEvent };
export { AccessPassType, AccessPassStatus, AccessPassEventType };

// ── Effective status (computed at runtime, not stored) ──────────────

export type EffectiveStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";

// ── Core function inputs ────────────────────────────────────────────

export interface IssuePassInput {
  tenantId: string;
  bookingId: string;
  guestId: string;
  type: AccessPassType;
  validFrom: Date;
  validTo: Date;
}

export interface IssuePassResult {
  pass: AccessPass;
  /** Raw token — returned ONCE at issuance. Never stored, never retrievable. */
  tokenRaw: string;
  /** True if pass already existed (idempotent return) */
  alreadyExisted: boolean;
}

export interface RevokePassInput {
  tenantId: string;
  passId: string;
  actorUserId: string;
  reason: string;
}

export interface RevokePassResult {
  pass: AccessPass;
  /** True if pass was already revoked before this call */
  alreadyRevoked: boolean;
}

export interface ValidateTokenInput {
  tenantId: string;
  /** Full payload string, format: pass:<passId>:<tokenRaw> */
  payload: string;
}

export type ValidateTokenResult =
  | {
      ok: true;
      passId: string;
      bookingId: string;
      guestId: string;
      type: AccessPassType;
      status: EffectiveStatus;
    }
  | {
      ok: false;
      reason:
        | "MALFORMED_PAYLOAD"
        | "PASS_NOT_FOUND"
        | "TENANT_MISMATCH"
        | "TOKEN_MISMATCH"
        | "NOT_ACTIVE";
    };

// ── Event logging context ───────────────────────────────────────────

export interface EventContext {
  actorUserId?: string;
  ip?: string;
  userAgent?: string;
}

// ── Wallet renderer interface (adapters implement this) ─────────────

export interface PlatformRef {
  platform: "APPLE" | "GOOGLE";
  externalId: string;
  addLink: string;
}

export interface WalletRenderer {
  readonly platform: "APPLE" | "GOOGLE";

  /**
   * Ensure a wallet pass exists for the given access pass.
   * Idempotent — returns existing ref if already created.
   */
  ensure(passId: string, tenantId: string): Promise<PlatformRef>;

  /**
   * Get the "Add to Wallet" link for a pass.
   * Returns null if not yet rendered.
   */
  getAddLink(passId: string, tenantId: string): Promise<string | null>;

  /**
   * Refresh the wallet pass (e.g. after revocation or expiry change).
   * No-op if pass hasn't been rendered to this platform.
   */
  refresh(passId: string, tenantId: string): Promise<void>;
}

// ── Admin query types ───────────────────────────────────────────────

export interface ListPassesFilter {
  tenantId: string;
  bookingId?: string;
  guestId?: string;
  status?: EffectiveStatus;
  type?: AccessPassType;
}

export interface PassWithEvents extends AccessPass {
  events: AccessPassEvent[];
}
