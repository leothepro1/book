/**
 * Guest Notes — the ONLY file that writes GuestNote.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { GuestNote } from "@prisma/client";

export async function addGuestNote(
  tenantId: string,
  guestAccountId: string,
  content: string,
  actorUserId?: string,
): Promise<{ success: boolean; noteId?: string; error?: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { success: false, error: "Anteckning kan inte vara tom" };
  if (trimmed.length > 2000) return { success: false, error: "Anteckning för lång (max 2000 tecken)" };

  const note = await prisma.guestNote.create({
    data: {
      tenantId,
      guestAccountId,
      content: trimmed,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    },
  });

  prisma.guestAccountEvent.create({
    data: {
      tenantId,
      guestAccountId,
      type: "NOTE_ADDED",
      message: "Anteckning tillagd",
      actorUserId: actorUserId ?? null,
    },
  }).catch(() => {});

  log("info", "guest.note.added", { tenantId, guestAccountId, noteId: note.id });
  return { success: true, noteId: note.id };
}

export async function getGuestNotes(
  tenantId: string,
  guestAccountId: string,
): Promise<GuestNote[]> {
  return prisma.guestNote.findMany({
    where: { tenantId, guestAccountId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteGuestNote(
  tenantId: string,
  noteId: string,
): Promise<{ success: boolean }> {
  await prisma.guestNote.deleteMany({
    where: { id: noteId, tenantId },
  });
  return { success: true };
}
