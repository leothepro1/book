/**
 * POST /api/guest-auth/verify-otp
 *
 * Verifies a 6-digit OTP code and creates a guest session on success.
 * Tenant is resolved server-side from the Host header (subdomain).
 * Returns generic "invalid_credentials" for all failure cases to prevent
 * information leakage about account existence or code validity.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { verifyOtp } from "@/app/_lib/guest-auth/otp";
import { setGuestSession } from "@/app/_lib/magic-link/session";
import { resolveGuestTenant } from "@/app/_lib/guest-auth/resolve-tenant";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }

  const tenantId = await resolveGuestTenant(req);
  if (!tenantId) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  // Look up guest account — generic error if not found
  const guestAccount = await prisma.guestAccount.findUnique({
    where: { tenantId_email: { tenantId, email: normalizedEmail } },
    select: { id: true },
  });

  if (!guestAccount) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  const valid = await verifyOtp(guestAccount.id, parsed.data.code);

  if (!valid) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  // Set guest session — same pattern as magic-link auth
  await setGuestSession({
    tenantId,
    email: normalizedEmail,
    authenticatedAt: Date.now(),
    guestAccountId: guestAccount.id,
  });

  // Redirect to session-driven portal home page.
  // /portal/home handles "no booking" via resolveGuestContext() → redirect to /no-booking.
  return NextResponse.json({ success: true, redirectTo: "/portal/home" });
}
