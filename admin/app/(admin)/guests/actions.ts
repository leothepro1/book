"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import {
  addGuestTag,
  removeGuestTag,
  addGuestNote,
  deleteGuestNote,
  updateEmailConsent,
} from "@/app/_lib/guests";
import {
  getGuestAccountFull,
  listGuestAccounts,
  type GuestAccountFull,
} from "@/app/_lib/guests/queries";
import type { GuestAccountState } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ── Helpers ──────────────────────────────────────────────────

async function requireTenant() {
  const ctx = await getCurrentTenant();
  if (!ctx) throw new Error("Inte inloggad");
  return ctx;
}

// ── Tag actions ──────────────────────────────────────────────

export async function addTagAction(guestAccountId: string, tag: string) {
  const { tenant, clerkUserId } = await requireTenant();
  const result = await addGuestTag(tenant.id, guestAccountId, tag, clerkUserId);
  revalidatePath("/guests");
  return result;
}

export async function removeTagAction(guestAccountId: string, tag: string) {
  const { tenant, clerkUserId } = await requireTenant();
  const result = await removeGuestTag(tenant.id, guestAccountId, tag, clerkUserId);
  revalidatePath("/guests");
  return result;
}

// ── Note actions ─────────────────────────────────────────────

export async function addNoteAction(guestAccountId: string, content: string) {
  const { tenant, clerkUserId } = await requireTenant();
  const result = await addGuestNote(tenant.id, guestAccountId, content, clerkUserId);
  revalidatePath("/guests");
  return result;
}

export async function deleteNoteAction(noteId: string) {
  const { tenant } = await requireTenant();
  const result = await deleteGuestNote(tenant.id, noteId);
  revalidatePath("/guests");
  return result;
}

// ── Consent actions ──────────────────────────────────────────

export async function updateConsentAction(
  guestAccountId: string,
  emailState: "SUBSCRIBED" | "UNSUBSCRIBED",
) {
  const { tenant, clerkUserId } = await requireTenant();
  const result = await updateEmailConsent(tenant.id, guestAccountId, emailState, {
    source: "manual",
    actorUserId: clerkUserId,
  });
  revalidatePath("/guests");
  return result;
}

// ── State actions ────────────────────────────────────────────

export async function updateGuestStateAction(
  guestAccountId: string,
  state: GuestAccountState,
) {
  const { tenant, clerkUserId } = await requireTenant();

  await prisma.guestAccount.updateMany({
    where: { id: guestAccountId, tenantId: tenant.id },
    data: { state },
  });

  const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
  await createGuestAccountEvent({
    guestAccountId,
    tenantId: tenant.id,
    type: "ACCOUNT_UPDATED",
    message: state === "DISABLED" ? "Konto inaktiverat" : `Kontostatus ändrad till ${state}`,
    actorUserId: clerkUserId,
    metadata: { state },
  });

  revalidatePath("/guests");
  return { success: true };
}

// ── Query actions ────────────────────────────────────────────

export async function getGuestAction(
  guestAccountId: string,
): Promise<GuestAccountFull | null> {
  const { tenant } = await requireTenant();
  return getGuestAccountFull(tenant.id, guestAccountId);
}

export async function listGuestsAction(
  options?: Parameters<typeof listGuestAccounts>[1],
) {
  const { tenant } = await requireTenant();
  return listGuestAccounts(tenant.id, options);
}
