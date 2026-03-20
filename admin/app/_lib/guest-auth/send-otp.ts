/**
 * Send OTP — orchestrates OTP creation and email delivery.
 *
 * Single entry point for requesting an OTP code.
 * Never throws to caller — returns a result object.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { createOtp } from "./otp";
import { sendEmailEvent } from "@/app/_lib/email/send";

/**
 * Generate an OTP code for a guest and send it via email.
 *
 * Flow:
 *   1. Normalize email
 *   2. Look up GuestAccount — if not found, return early
 *   3. Resolve guest display name from most recent booking
 *   4. Create OTP code
 *   5. Send GUEST_OTP email and read the result
 *   6. Return result
 *
 * Never throws — failures are returned as a reason.
 */
export async function sendOtp(
  tenantId: string,
  email: string,
): Promise<{ sent: boolean; reason?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const guestAccount = await prisma.guestAccount.findUnique({
    where: { tenantId_email: { tenantId, email: normalizedEmail } },
  });

  if (!guestAccount) {
    return { sent: false, reason: "no_account" };
  }

  // Resolve guest display name from most recent linked booking
  const booking = await prisma.booking.findFirst({
    where: { guestAccountId: guestAccount.id },
    orderBy: { createdAt: "desc" },
    select: { firstName: true, lastName: true },
  });
  const guestName = booking
    ? `${booking.firstName} ${booking.lastName}`.trim()
    : normalizedEmail;

  const rawCode = await createOtp(guestAccount.id);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });

  const result = await sendEmailEvent(tenantId, "GUEST_OTP", normalizedEmail, {
    guestName,
    otpCode: rawCode,
    hotelName: tenant.name,
    expiresInMinutes: "10",
  });

  switch (result.status) {
    case "sent":
      return { sent: true };
    case "rate_limited":
      return { sent: false, reason: "rate_limited" };
    case "skipped_unsubscribed":
      return { sent: false, reason: "unsubscribed" };
    case "failed":
      console.error(
        `[guest-otp] Failed to send OTP email for account=${guestAccount.id}`,
        result.error,
      );
      return { sent: false, reason: "email_failed" };
  }
}
