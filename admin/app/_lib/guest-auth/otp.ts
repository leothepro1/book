/**
 * OTP Lifecycle
 * ═════════════
 *
 * Owns all GuestOtpCode read/write logic.
 * Raw codes are never logged, never stored — only SHA-256 hashes.
 *
 * Only this file and send-otp.ts may call prisma.guestOtpCode.
 */

import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/app/_lib/db/prisma";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Hash a raw OTP code with SHA-256.
 * Returns hex digest — deterministic for the same input.
 */
function hashCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate a new OTP code for a guest account.
 *
 * - Generates a cryptographically random 6-digit code
 * - Deletes any existing unused, unexpired codes (one active at a time)
 * - Stores only the SHA-256 hash
 * - Returns the raw code (only time it exists — never log it)
 */
export async function createOtp(guestAccountId: string): Promise<string> {
  const rawCode = randomInt(100000, 999999).toString();
  const codeHash = hashCode(rawCode);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Delete previous active (unused + unexpired) codes
  await prisma.guestOtpCode.deleteMany({
    where: {
      guestAccountId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  await prisma.guestOtpCode.create({
    data: { guestAccountId, codeHash, expiresAt },
  });

  return rawCode;
}

/**
 * Verify an OTP code for a guest account.
 *
 * - Finds the active (unused, unexpired) code for this account
 * - If no active code → false
 * - If code has >= MAX_FAILED_ATTEMPTS → already invalidated, false
 * - If hash doesn't match → increment failedAttempts, invalidate at threshold
 * - If hash matches → mark as used, return true
 * - Never logs the raw code
 */
export async function verifyOtp(
  guestAccountId: string,
  rawCode: string,
): Promise<boolean> {
  // Find the active OTP code (there should be at most one)
  const record = await prisma.guestOtpCode.findFirst({
    where: {
      guestAccountId,
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
  });

  if (!record) return false;

  // Already locked out from too many failed attempts
  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) return false;

  const codeHash = hashCode(rawCode);

  if (record.codeHash !== codeHash) {
    const newFailedAttempts = record.failedAttempts + 1;

    // Invalidate code if threshold reached
    await prisma.guestOtpCode.update({
      where: { id: record.id },
      data: {
        failedAttempts: newFailedAttempts,
        ...(newFailedAttempts >= MAX_FAILED_ATTEMPTS
          ? { usedAt: new Date() }
          : {}),
      },
    });

    return false;
  }

  // Correct code — mark as used
  await prisma.guestOtpCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return true;
}
