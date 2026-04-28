"use server";

import type { DraftOrder } from "@prisma/client";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { getDraft, type DraftDetail } from "@/app/_lib/draft-orders/get";
import {
  updateDraftMeta,
  type DraftMetaPatch,
} from "@/app/_lib/draft-orders/update-meta";
import { updateDraftCustomer } from "@/app/_lib/draft-orders/update-customer";
import {
  applyDiscountCode,
  removeDiscountCode,
} from "@/app/_lib/draft-orders/discount";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "@/app/_lib/errors/service-errors";

async function getTenantId(): Promise<string | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

async function getActor(): Promise<{ tenantId: string | null; userId?: string }> {
  const { orgId, userId } = await getAuth();
  if (!orgId) return { tenantId: null };
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return {
    tenantId: tenant?.id ?? null,
    userId: userId ?? undefined,
  };
}

const NO_TENANT_ERROR = "Ingen tenant";

// ── Result shape consumed by the UI layer ──────────────────────

export type DraftMutationResult =
  | { ok: true; draft: DraftOrder }
  | { ok: false; error: string };

// ── Read action (existing) ─────────────────────────────────────

export async function getDraftAction(
  draftId: string,
): Promise<DraftDetail | null> {
  const tenantId = await getTenantId();
  if (!tenantId) return null;
  return getDraft(draftId, tenantId);
}

// ── Mutation actions ───────────────────────────────────────────

export type UpdateDraftMetaActionInput = {
  draftId: string;
  customerNote?: string | null;
  internalNote?: string | null;
  tags?: string[];
  expiresAt?: Date;
};

export async function updateDraftMetaAction(
  input: UpdateDraftMetaActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  const patch: DraftMetaPatch = {};
  if (input.customerNote !== undefined) patch.customerNote = input.customerNote;
  if (input.internalNote !== undefined) patch.internalNote = input.internalNote;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;

  return updateDraftMeta(input.draftId, actor.tenantId, patch, {
    source: "admin_ui",
    userId: actor.userId,
  });
}

export type UpdateDraftCustomerActionInput = {
  draftId: string;
  guestAccountId: string | null;
};

export async function updateDraftCustomerAction(
  input: UpdateDraftCustomerActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  return updateDraftCustomer(
    input.draftId,
    actor.tenantId,
    { guestAccountId: input.guestAccountId },
    { source: "admin_ui", userId: actor.userId },
  );
}

export type ApplyDraftDiscountCodeActionInput = {
  draftId: string;
  code: string;
};

export async function applyDraftDiscountCodeAction(
  input: ApplyDraftDiscountCodeActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await applyDiscountCode({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      code: input.code,
      actorUserId: actor.userId,
    });
    return { ok: true, draft: result.draft };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    if (err instanceof ConflictError) return { ok: false, error: err.message };
    throw err;
  }
}

export type RemoveDraftDiscountCodeActionInput = {
  draftId: string;
};

export async function removeDraftDiscountCodeAction(
  input: RemoveDraftDiscountCodeActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await removeDiscountCode({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      actorUserId: actor.userId,
    });
    return { ok: true, draft: result.draft };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    if (err instanceof ConflictError) return { ok: false, error: err.message };
    throw err;
  }
}
