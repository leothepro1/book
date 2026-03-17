/**
 * GET /api/email-sender/verify/confirm?token=...
 *
 * Confirms email sender verification. No auth required —
 * the link arrives in the target email inbox.
 *
 * On success: activates the pending emailFrom and redirects to settings.
 * On failure: redirects to sign-in with error param.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!token) {
    return NextResponse.redirect(`${appUrl}/sign-in?error=link_expired`);
  }

  // Find tenant by verification token
  const tenant = await prisma.tenant.findUnique({
    where: { emailVerificationToken: token },
    select: {
      id: true,
      pendingEmailFrom: true,
      emailVerificationExpiry: true,
    },
  });

  // Token not found or expired
  if (!tenant || !tenant.pendingEmailFrom || !tenant.emailVerificationExpiry) {
    return NextResponse.redirect(`${appUrl}/sign-in?error=link_expired`);
  }

  if (tenant.emailVerificationExpiry < new Date()) {
    return NextResponse.redirect(`${appUrl}/sign-in?error=link_expired`);
  }

  // Activate the pending emailFrom and clear verification fields
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      emailFrom: tenant.pendingEmailFrom,
      pendingEmailFrom: null,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      emailVerificationSentTo: null,
    },
  });

  // Redirect to settings — Clerk handles auth, then redirects
  return NextResponse.redirect(
    `${appUrl}/sign-in?redirect_url=/settings/email&verified=1`,
  );
}
