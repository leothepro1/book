/**
 * POST /api/guest-auth/register
 *
 * Creates a guest account (if it doesn't exist) and sends an OTP code.
 * This is the registration counterpart to request-otp (which requires
 * an existing account). The resulting GuestAccount is identical to one
 * created via order payment — same model, same events, same automations.
 *
 * Tenant is resolved server-side from the Host header (subdomain).
 * Always returns 200 with { sent: true } regardless of whether the
 * account already existed — prevents account enumeration attacks.
 * Only rate limiting returns 429.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertGuestAccount } from "@/app/_lib/guest-auth/account";
import { sendOtp } from "@/app/_lib/guest-auth/send-otp";
import { resolveGuestTenant } from "@/app/_lib/guest-auth/resolve-tenant";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

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

  // Ensure account exists — idempotent, creates if new
  await upsertGuestAccount(tenantId, parsed.data.email, {
    source: "register",
  });

  // Send OTP — account now guaranteed to exist
  const result = await sendOtp(tenantId, parsed.data.email);

  if (result.reason === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
  }

  // Always return 200 + { sent: true } — same anti-enumeration as login
  return NextResponse.json({ sent: true });
}
