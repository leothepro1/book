/**
 * POST /api/email-sender/verify/initiate
 *
 * Initiates email sender verification for a tenant.
 * Generates a verification token, stores it, and sends a
 * confirmation email to the new address.
 *
 * The active emailFrom is never changed until verification completes.
 */

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin, getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { resendClient } from "@/app/_lib/email/client";
import { render } from "@react-email/components";
import VerifySender from "@/app/_lib/email/templates/verify-sender";

const bodySchema = z.object({
  emailFrom: z.string().email().max(254),
});

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 });
  }

  const { orgId } = await getAuth();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true, name: true, emailFrom: true, portalSlug: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Parse and validate body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    parsed = bodySchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Ogiltig e-postadress" }, { status: 400 });
  }

  // Reject if already active
  if (parsed.emailFrom === tenant.emailFrom) {
    return NextResponse.json(
      { error: "Den här adressen är redan aktiv" },
      { status: 400 },
    );
  }

  // Generate token
  const token = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store pending verification (upsert — replace any existing pending)
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      pendingEmailFrom: parsed.emailFrom,
      emailVerificationToken: token,
      emailVerificationExpiry: expiry,
      emailVerificationSentTo: parsed.emailFrom,
    },
  });

  // Build confirm URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const confirmUrl = `${appUrl}/api/email-sender/verify/confirm?token=${token}`;

  // Send verification email — from platform noreply, never from unverified address
  // Using resendClient directly here because this is a platform-level email,
  // not a tenant event email. sendEmailEvent() is for tenant notifications.
  try {
    const html = await render(
      VerifySender({ confirmUrl, platformName: "Bedfront" }),
    );

    await resendClient.emails.send({
      from: "Bedfront <noreply@bedfront.com>",
      to: parsed.emailFrom,
      subject: `Verifiera din avsändare – ${parsed.emailFrom}`,
      html,
    });
  } catch (err) {
    // Log but don't fail — token is already saved, user can retry
    console.error("[email-sender] Failed to send verification email:", err);
  }

  return NextResponse.json({ sent: true });
}
