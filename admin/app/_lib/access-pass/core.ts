/**
 * AccessPass Core — the canonical source of truth for hotel access credentials.
 *
 * Architecture:
 *  - All logic lives here. Apple/Google are thin adapters on top.
 *  - Tokens are hashed with HMAC-SHA256 + pepper. Never stored in cleartext.
 *  - Idempotency is enforced via DB unique constraints + transactions.
 *  - Race safety comes from PostgreSQL unique indexes + P2002 discrimination.
 *  - Every mutation produces an immutable audit event.
 *  - All functions require tenantId — no cross-tenant access is possible.
 *  - Booking existence is verified before issuance — no orphan passes.
 *
 * Key invariant: @@unique([tenantId, bookingId, type]) in the DB guarantees
 * that even if 50 concurrent requests try to issue the same pass, exactly
 * one succeeds and the rest get the existing pass back (idempotent).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  generateTokenRaw,
  hashToken,
  tokenLast4,
  generateSerial,
  safeCompare,
} from "./crypto";
import { logPassEvent } from "./events";
import type {
  IssuePassInput,
  IssuePassResult,
  RevokePassInput,
  RevokePassResult,
  ValidateTokenInput,
  ValidateTokenResult,
  EffectiveStatus,
  AccessPass,
  EventContext,
} from "./types";

// ── Lifecycle hooks ─────────────────────────────────────────────────

/**
 * Hook called whenever a pass changes state (issued, revoked, etc.).
 * External systems (wallet renderers, PMS integrations, lock systems)
 * register listeners here without coupling to core.
 *
 * Listeners MUST NOT throw — failures are logged and swallowed.
 * Listeners run after the DB transaction is committed.
 */
type PassStateListener = (passId: string, tenantId: string) => Promise<void>;
const _stateListeners: PassStateListener[] = [];

export function onPassStateChanged(listener: PassStateListener): () => void {
  _stateListeners.push(listener);
  return () => {
    const idx = _stateListeners.indexOf(listener);
    if (idx >= 0) _stateListeners.splice(idx, 1);
  };
}

async function notifyStateChanged(passId: string, tenantId: string): Promise<void> {
  for (const listener of _stateListeners) {
    try {
      await listener(passId, tenantId);
    } catch (err) {
      console.error("[AccessPass:Hook] onPassStateChanged listener failed", {
        passId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── P2002 constraint discrimination ─────────────────────────────────

/** The composite unique constraint name for (tenantId, bookingId, type). */
const COMPOSITE_UNIQUE_TARGET = ["tenantId", "bookingId", "type"];

/**
 * Check if a P2002 error was caused by the composite booking+type constraint.
 * If it was caused by serial or tokenHash collision, we need to retry —
 * not return an existing pass.
 */
function isCompositeUniqueViolation(err: Prisma.PrismaClientKnownRequestError): boolean {
  const target = err.meta?.target;
  if (!Array.isArray(target)) return false;
  return COMPOSITE_UNIQUE_TARGET.every((f) => target.includes(f));
}

// ── Max retries for serial/tokenHash collisions ─────────────────────

const MAX_CRYPTO_RETRIES = 3;

// ════════════════════════════════════════════════════════════════════
// 2.1 — issuePass
// ════════════════════════════════════════════════════════════════════

/**
 * Issue a new access pass for a booking.
 *
 * Guarantees:
 *  - Booking verified: the booking must exist and belong to the given tenant.
 *  - Idempotent: if a pass of the same type already exists for this
 *    booking+tenant, the existing pass is returned (alreadyExisted=true).
 *    NOTE: tokenRaw is NOT returned for existing passes — it was returned
 *    once at initial issuance and is not retrievable.
 *  - Race-safe: concurrent calls are serialized by the DB unique constraint.
 *    P2002 errors are discriminated — composite unique violations are idempotent
 *    returns; serial/tokenHash collisions trigger retry with fresh values.
 *  - Audited: an ISSUED event is logged on successful creation.
 *  - Hook: onPassStateChanged is called after successful creation.
 *
 * @returns The pass metadata + tokenRaw (only on first issuance).
 */
export async function issuePass(
  input: IssuePassInput,
  context?: EventContext,
): Promise<IssuePassResult> {
  const { tenantId, bookingId, guestId, type, validFrom, validTo } = input;

  // ── Validate inputs ───────────────────────────────────────────
  if (validTo <= validFrom) {
    throw new Error("validTo must be after validFrom");
  }

  // ── Verify booking exists and belongs to tenant ───────────────
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, tenantId },
    select: { id: true, tenantId: true },
  });

  if (!booking) {
    throw new Error(
      `Booking ${bookingId} not found in tenant ${tenantId}. ` +
        "Cannot issue pass for non-existent or cross-tenant booking.",
    );
  }

  // ── Fast path: check for existing pass (no crypto work) ───────
  const existing = await prisma.accessPass.findUnique({
    where: {
      tenantId_bookingId_type: { tenantId, bookingId, type },
    },
  });

  if (existing) {
    return {
      pass: existing,
      tokenRaw: "", // Never return token for existing passes
      alreadyExisted: true,
    };
  }

  // ── Create with retry on serial/tokenHash collision ───────────
  for (let attempt = 0; attempt < MAX_CRYPTO_RETRIES; attempt++) {
    const tokenRaw = generateTokenRaw();
    const tokenHashValue = hashToken(tokenRaw);
    const tokenLast4Value = tokenLast4(tokenRaw);
    const serial = generateSerial();

    const now = new Date();
    const initialStatus = now >= validFrom && now < validTo ? "ACTIVE" : "PENDING";

    try {
      const pass = await prisma.accessPass.create({
        data: {
          tenantId,
          bookingId,
          guestId,
          type,
          status: initialStatus,
          validFrom,
          validTo,
          serial,
          tokenHash: tokenHashValue,
          tokenLast4: tokenLast4Value,
        },
      });

      // Audit
      await logPassEvent({
        tenantId,
        passId: pass.id,
        type: "ISSUED",
        context,
        metadata: {
          passType: type,
          bookingId,
          guestId,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          serial,
        },
      });

      // Notify listeners (wallet renderers, PMS hooks, etc.)
      await notifyStateChanged(pass.id, tenantId);

      return { pass, tokenRaw, alreadyExisted: false };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Discriminate: which constraint was violated?
        if (isCompositeUniqueViolation(err)) {
          // Another request created the same pass — idempotent return
          const raced = await prisma.accessPass.findUnique({
            where: {
              tenantId_bookingId_type: { tenantId, bookingId, type },
            },
          });
          if (raced) {
            return { pass: raced, tokenRaw: "", alreadyExisted: true };
          }
        }

        // serial or tokenHash collision — retry with fresh crypto values
        console.warn(
          `[AccessPass:Issue] Crypto collision on attempt ${attempt + 1}, retrying`,
          { target: err.meta?.target },
        );
        continue;
      }

      // Non-P2002 error — rethrow immediately
      throw err;
    }
  }

  throw new Error(
    `Failed to issue pass after ${MAX_CRYPTO_RETRIES} attempts due to crypto collisions. ` +
      "This should never happen — investigate entropy source.",
  );
}

// ════════════════════════════════════════════════════════════════════
// 2.2 — revokePass
// ════════════════════════════════════════════════════════════════════

/**
 * Revoke (kill switch) an access pass.
 *
 * Guarantees:
 *  - Idempotent: revoking an already-revoked pass is a no-op that returns OK.
 *  - Tenant-scoped: passId is looked up within tenantId — no cross-tenant.
 *  - Audited: a REVOKED event is logged on first revocation.
 *  - Optimistic locking: version is checked to prevent lost updates.
 *  - Hook: onPassStateChanged is called after successful revocation.
 */
export async function revokePass(
  input: RevokePassInput,
  context?: EventContext,
): Promise<RevokePassResult> {
  const { tenantId, passId, actorUserId, reason } = input;

  const pass = await prisma.accessPass.findFirst({
    where: { id: passId, tenantId },
  });

  if (!pass) {
    throw new Error(`AccessPass not found: ${passId} in tenant ${tenantId}`);
  }

  // Idempotent: already revoked
  if (pass.revokedAt !== null) {
    return { pass, alreadyRevoked: true };
  }

  // Revoke with optimistic locking
  const now = new Date();
  const updated = await prisma.accessPass.updateMany({
    where: {
      id: passId,
      tenantId,
      version: pass.version,
      revokedAt: null,
    },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revokedByUserId: actorUserId,
      revokeReason: reason,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    // Lost the race — re-fetch and return as already revoked
    const refetched = await prisma.accessPass.findFirst({
      where: { id: passId, tenantId },
    });
    if (refetched) {
      return { pass: refetched, alreadyRevoked: true };
    }
    throw new Error(`AccessPass disappeared during revoke: ${passId}`);
  }

  const revokedPass = await prisma.accessPass.findFirst({
    where: { id: passId, tenantId },
  });

  if (!revokedPass) {
    throw new Error(`AccessPass disappeared after revoke: ${passId}`);
  }

  // Audit
  await logPassEvent({
    tenantId,
    passId,
    type: "REVOKED",
    context: { ...context, actorUserId },
    metadata: {
      reason,
      revokedAt: now.toISOString(),
    },
  });

  // Notify listeners (wallet renderers can push update to Apple/Google)
  await notifyStateChanged(passId, tenantId);

  return { pass: revokedPass, alreadyRevoked: false };
}

// ════════════════════════════════════════════════════════════════════
// 2.2b — revokePassesByBooking (bulk operation)
// ════════════════════════════════════════════════════════════════════

/**
 * Revoke ALL active passes for a booking.
 * Used when a booking is cancelled or a guest is checked out early.
 *
 * Returns the number of passes revoked (0 is valid — idempotent).
 */
export async function revokePassesByBooking(
  tenantId: string,
  bookingId: string,
  actorUserId: string,
  reason: string,
  context?: EventContext,
): Promise<{ revokedCount: number }> {
  // Find all non-revoked passes for this booking
  const passes = await prisma.accessPass.findMany({
    where: { tenantId, bookingId, revokedAt: null },
    select: { id: true },
  });

  if (passes.length === 0) {
    return { revokedCount: 0 };
  }

  const now = new Date();

  // Bulk revoke in a single transaction
  const [result] = await prisma.$transaction([
    prisma.accessPass.updateMany({
      where: {
        tenantId,
        bookingId,
        revokedAt: null,
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedByUserId: actorUserId,
        revokeReason: reason,
        version: { increment: 1 },
      },
    }),
  ]);

  // Audit each revoked pass individually (immutable per-pass trail)
  for (const { id } of passes) {
    await logPassEvent({
      tenantId,
      passId: id,
      type: "REVOKED",
      context: { ...context, actorUserId },
      metadata: {
        reason,
        revokedAt: now.toISOString(),
        bulk: true,
        bookingId,
      },
    });
    await notifyStateChanged(id, tenantId);
  }

  return { revokedCount: result.count };
}

// ════════════════════════════════════════════════════════════════════
// 2.3 — computeEffectiveStatus
// ════════════════════════════════════════════════════════════════════

/**
 * Compute the runtime-effective status of a pass.
 *
 * This is the ONLY source of truth for "is this pass usable right now?".
 * The persisted `status` field is a hint; this function is authoritative.
 *
 * Priority:
 *  1. REVOKED — revokedAt is set (kill switch, overrides everything)
 *  2. EXPIRED — now >= validTo
 *  3. PENDING — now < validFrom
 *  4. ACTIVE — within the validity window
 */
export function computeEffectiveStatus(
  pass: Pick<AccessPass, "revokedAt" | "validFrom" | "validTo">,
  now: Date = new Date(),
): EffectiveStatus {
  if (pass.revokedAt !== null) return "REVOKED";
  if (now >= pass.validTo) return "EXPIRED";
  if (now < pass.validFrom) return "PENDING";
  return "ACTIVE";
}

// ════════════════════════════════════════════════════════════════════
// 2.4 — validatePassToken
// ════════════════════════════════════════════════════════════════════

/**
 * Validate an access pass token payload.
 *
 * Payload format: "pass:<passId>:<tokenRaw>"
 *
 * Security guarantees:
 *  - Fail closed: any parse/lookup/match failure returns { ok: false }.
 *  - Constant-time token comparison (prevents timing attacks).
 *  - Tenant isolation: passId is always looked up within the given tenantId.
 *  - Effective status check: only ACTIVE passes validate.
 *  - Full audit: both allow and deny are logged with context.
 *
 * Rate limiting should be applied in the calling layer (API route/middleware).
 * See types.ts ValidateTokenResult for the hook point.
 */
export async function validatePassToken(
  input: ValidateTokenInput,
  context?: EventContext,
): Promise<ValidateTokenResult> {
  const { tenantId, payload } = input;

  // ── 1. Parse payload ──────────────────────────────────────────
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== "pass") {
    await logDeny(tenantId, null, "MALFORMED_PAYLOAD", context);
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }

  const [, passId, tokenRaw] = parts;

  if (!passId || !tokenRaw) {
    await logDeny(tenantId, null, "MALFORMED_PAYLOAD", context);
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }

  // ── 2. Look up pass (tenant-scoped) ───────────────────────────
  const pass = await prisma.accessPass.findFirst({
    where: { id: passId, tenantId },
  });

  if (!pass) {
    await logDeny(tenantId, passId, "PASS_NOT_FOUND", context);
    return { ok: false, reason: "PASS_NOT_FOUND" };
  }

  // ── 3. Verify tenant match (defense in depth) ─────────────────
  if (pass.tenantId !== tenantId) {
    await logDeny(tenantId, passId, "TENANT_MISMATCH", context);
    return { ok: false, reason: "TENANT_MISMATCH" };
  }

  // ── 4. Constant-time token comparison ─────────────────────────
  const candidateHash = hashToken(tokenRaw);
  if (!safeCompare(candidateHash, pass.tokenHash)) {
    await logDeny(tenantId, passId, "TOKEN_MISMATCH", context);
    return { ok: false, reason: "TOKEN_MISMATCH" };
  }

  // ── 5. Check effective status ─────────────────────────────────
  const status = computeEffectiveStatus(pass);
  if (status !== "ACTIVE") {
    await logDeny(tenantId, passId, "NOT_ACTIVE", context, {
      effectiveStatus: status,
    });
    return { ok: false, reason: "NOT_ACTIVE" };
  }

  // ── 6. Allow ──────────────────────────────────────────────────
  await logPassEvent({
    tenantId,
    passId: pass.id,
    type: "VALIDATE_ALLOW",
    context,
    metadata: { bookingId: pass.bookingId },
  });

  return {
    ok: true,
    passId: pass.id,
    bookingId: pass.bookingId,
    guestId: pass.guestId,
    type: pass.type,
    status,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

async function logDeny(
  tenantId: string,
  passId: string | null,
  reason: string,
  context?: EventContext,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!passId) {
    console.warn("[AccessPass:Validate] Deny without passId", {
      tenantId,
      reason,
      ip: context?.ip,
    });
    return;
  }

  await logPassEvent({
    tenantId,
    passId,
    type: "VALIDATE_DENY",
    context,
    metadata: { reason, ...metadata },
  });
}
