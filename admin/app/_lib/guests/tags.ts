/**
 * Guest Tags — the ONLY file that writes GuestTag.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

function normalizeTag(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "-").slice(0, 40);
}

export async function addGuestTag(
  tenantId: string,
  guestAccountId: string,
  tag: string,
  actorUserId?: string,
): Promise<{ success: boolean; error?: string; alreadyExists?: boolean }> {
  const normalized = normalizeTag(tag);
  if (!normalized) return { success: false, error: "Tagg kan inte vara tom" };
  if (normalized.length > 40) return { success: false, error: "Tagg för lång" };

  try {
    await prisma.guestTag.create({
      data: { tenantId, guestAccountId, tag: normalized, createdBy: actorUserId },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return { success: true, alreadyExists: true };
    }
    throw err;
  }

  prisma.guestAccountEvent.create({
    data: {
      tenantId,
      guestAccountId,
      type: "TAG_ADDED",
      message: `Tagg "${normalized}" tillagd`,
      actorUserId: actorUserId ?? null,
    },
  }).catch(() => {});

  log("info", "guest.tag.added", { tenantId, guestAccountId, tag: normalized });
  return { success: true };
}

export async function removeGuestTag(
  tenantId: string,
  guestAccountId: string,
  tag: string,
  actorUserId?: string,
): Promise<{ success: boolean }> {
  const normalized = normalizeTag(tag);

  await prisma.guestTag.deleteMany({
    where: { tenantId, guestAccountId, tag: normalized },
  });

  prisma.guestAccountEvent.create({
    data: {
      tenantId,
      guestAccountId,
      type: "TAG_REMOVED",
      message: `Tagg "${normalized}" borttagen`,
      actorUserId: actorUserId ?? null,
    },
  }).catch(() => {});

  log("info", "guest.tag.removed", { tenantId, guestAccountId, tag: normalized });
  return { success: true };
}

export async function getGuestTags(
  tenantId: string,
  guestAccountId: string,
): Promise<string[]> {
  const tags = await prisma.guestTag.findMany({
    where: { tenantId, guestAccountId },
    orderBy: { createdAt: "asc" },
    select: { tag: true },
  });
  return tags.map((t) => t.tag);
}
