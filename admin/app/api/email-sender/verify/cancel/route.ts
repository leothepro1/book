export const dynamic = "force-dynamic";

/**
 * DELETE /api/email-sender/verify/cancel
 *
 * Cancels a pending email sender verification.
 * Clears all verification fields — emailFrom stays unchanged.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin, getAuth } from "@/app/(admin)/_lib/auth/devAuth";

export async function DELETE() {
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
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      pendingEmailFrom: null,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      emailVerificationSentTo: null,
    },
  });

  return NextResponse.json({ cancelled: true });
}
