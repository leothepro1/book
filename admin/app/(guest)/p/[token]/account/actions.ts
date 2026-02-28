"use server";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type AccountPatch = {
  token: string; // booking.id (nuvarande token-modell)
  tenantId: string;
  guestEmail: string;

  firstName?: string;
  lastName?: string;
  phone?: string | null;

  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

export async function updateGuestAccount(patch: AccountPatch) {
  const b = await prisma.booking.findFirst({
    where: { id: patch.token },
    select: { id: true, tenantId: true, guestEmail: true },
  });

  if (!b) return { ok: false as const, error: "booking_not_found" as const };
  if (b.tenantId !== patch.tenantId || b.guestEmail !== patch.guestEmail) {
    return { ok: false as const, error: "mismatch" as const };
  }

  const data: Record<string, unknown> = {};

  if (patch.firstName !== undefined) data.firstName = patch.firstName.trim();
  if (patch.lastName !== undefined) data.lastName = patch.lastName.trim();

  if (patch.phone !== undefined) data.phone = (patch.phone ?? "").trim() || null;

  if (patch.street !== undefined) data.street = (patch.street ?? "").trim() || null;
  if (patch.postalCode !== undefined)
    data.postalCode = (patch.postalCode ?? "").trim() || null;
  if (patch.city !== undefined) data.city = (patch.city ?? "").trim() || null;
  if (patch.country !== undefined) data.country = (patch.country ?? "").trim() || null;

  if (Object.keys(data).length === 0) return { ok: true as const };

  await prisma.booking.updateMany({
    where: { tenantId: patch.tenantId, guestEmail: patch.guestEmail },
    data,
  });

  return { ok: true as const };
}
