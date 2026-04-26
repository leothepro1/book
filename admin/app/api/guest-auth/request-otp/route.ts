/**
 * POST /api/guest-auth/request-otp
 *
 * Generates and sends an OTP code to the guest's email.
 * Tenant is resolved server-side from the Host header (subdomain).
 * Always returns 200 with { sent: true } regardless of account existence
 * to prevent account enumeration attacks. Only rate limiting returns 429.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOtp } from "@/app/_lib/guest-auth/send-otp";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }

  const tenant = await resolveTenantFromHost();
  const tenantId = tenant?.id ?? null;
  if (!tenantId) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }

  const result = await sendOtp(tenantId, parsed.data.email);

  if (result.reason === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
  }

  // Always return 200 + { sent: true } for all other cases:
  // - sent successfully
  // - no_account (don't leak account existence)
  // - email_failed (degrade gracefully)
  // - unsubscribed (don't leak unsubscribe status)
  return NextResponse.json({ sent: true });
}
