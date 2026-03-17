/**
 * PATCH /api/email-branding
 *
 * Updates email branding (logo + accent color) for the current tenant.
 * Partial update — only fields present in body are written.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin, getAuth } from "@/app/(admin)/_lib/auth/devAuth";

const bodySchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  logoWidth: z.number().int().min(24).max(400).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Måste vara ett giltigt hex-värde")
    .nullable()
    .optional(),
});

export async function PATCH(req: Request) {
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

  let parsed: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    parsed = bodySchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Ogiltiga värden" }, { status: 400 });
  }

  // Build partial update — only fields present in body
  const data: Record<string, string | number | null> = {};
  if ("logoUrl" in parsed) data.emailLogoUrl = parsed.logoUrl ?? null;
  if ("logoWidth" in parsed) data.emailLogoWidth = parsed.logoWidth ?? null;
  if ("accentColor" in parsed) data.emailAccentColor = parsed.accentColor ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data,
    select: { emailLogoUrl: true, emailLogoWidth: true, emailAccentColor: true },
  });

  return NextResponse.json(updated);
}
