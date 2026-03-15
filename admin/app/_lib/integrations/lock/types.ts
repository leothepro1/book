import { z } from "zod";

// ── Provider ────────────────────────────────────────────────

export const LockProviderSchema = z.enum(["fake", "salto", "assa_abloy", "nuki", "manual"]);
export type LockProvider = z.infer<typeof LockProviderSchema>;

// ── Key status ──────────────────────────────────────────────

export const KeyStatusSchema = z.enum(["active", "revoked", "expired"]);
export type KeyStatus = z.infer<typeof KeyStatusSchema>;

// ── Key event types ─────────────────────────────────────────

export const KeyEventTypeSchema = z.enum([
  "key_created",
  "key_revoked",
  "key_expired",
  "connection_tested",
  "connection_failed",
]);
export type KeyEventType = z.infer<typeof KeyEventTypeSchema>;

// ── Wallet payload ──────────────────────────────────────────

export const WalletPayloadSchema = z.object({
  passTypeIdentifier: z.string(),
  serialNumber: z.string(),
  authenticationToken: z.string(),
  passData: z.record(z.string(), z.unknown()),
});
export type WalletPayload = z.infer<typeof WalletPayloadSchema>;

// ── Portal payload ──────────────────────────────────────────

export const PortalPayloadSchema = z.object({
  qrCode: z.string().nullable(),
  deepLink: z.string().nullable(),
  displayText: z.string(),
});
export type PortalPayload = z.infer<typeof PortalPayloadSchema>;

// ── Normalized key ──────────────────────────────────────────

export const NormalizedKeySchema = z.object({
  keyId: z.string(),
  provider: LockProviderSchema,
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  status: KeyStatusSchema,
  walletPayload: WalletPayloadSchema,
  portalPayload: PortalPayloadSchema,
});
export type NormalizedKey = z.infer<typeof NormalizedKeySchema>;

// ── Create key params ───────────────────────────────────────

export const CreateKeyParamsSchema = z.object({
  tenantId: z.string(),
  bookingId: z.string(),
  guestName: z.string(),
  roomIdentifier: z.string(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
});
export type CreateKeyParams = z.infer<typeof CreateKeyParamsSchema>;

// ── Connection result ───────────────────────────────────────

export const ConnectionResultSchema = z.object({
  success: z.boolean(),
  providerName: z.string(),
  reason: z.string().nullable(),
});
export type ConnectionResult = z.infer<typeof ConnectionResultSchema>;
