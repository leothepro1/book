/**
 * PATCH /api/guest-auth/profile
 *
 * Updates the authenticated guest's profile fields.
 * Session is validated via iron-session — guestAccountId comes from
 * the session, NEVER from the request body.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getGuestSession } from "@/app/_lib/magic-link/session";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  address1: z.string().max(200).optional(),
  address2: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
});

export async function PATCH(req: Request) {
  const session = await getGuestSession();

  if (!session?.guestAccountId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Build update payload — only include provided fields
  const data: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const updated = await prisma.guestAccount.update({
    where: { id: session.guestAccountId },
    data,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      address1: true,
      city: true,
      postalCode: true,
      country: true,
    },
  });

  return NextResponse.json({ ok: true, account: updated });
}
