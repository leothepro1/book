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
  addLineItem,
  updateLineItem,
  removeLineItem,
} from "@/app/_lib/draft-orders/lines";
import type {
  AddLineItemInput,
  UpdateLineItemInput,
} from "@/app/_lib/draft-orders/types";
import { freezePrices, sendInvoice, cancelDraft } from "@/app/_lib/draft-orders/lifecycle";
import { markDraftAsPaid } from "@/app/_lib/draft-orders/mark-as-paid";
import { sendEmailEvent, type EmailSendResult } from "@/app/_lib/email";
import { formatSek } from "@/app/_lib/money/format";
import { formatSwedishDate } from "@/app/_lib/search/dates";
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

// ── Line-item actions (FAS 7.2b.4c) ────────────────────────────

export type AddDraftLineItemActionInput = {
  draftId: string;
  line: AddLineItemInput["line"];
};

export async function addDraftLineItemAction(
  input: AddDraftLineItemActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await addLineItem({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      line: input.line,
      actorUserId: actor.userId,
    });
    return { ok: true, draft: result.draft };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}

export type UpdateDraftLineItemActionInput = {
  draftId: string;
  lineItemId: string;
  patch: UpdateLineItemInput["patch"];
};

export async function updateDraftLineItemAction(
  input: UpdateDraftLineItemActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await updateLineItem({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      lineItemId: input.lineItemId,
      patch: input.patch,
      actorUserId: actor.userId,
    });
    return { ok: true, draft: result.draft };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}

export type RemoveDraftLineItemActionInput = {
  draftId: string;
  lineItemId: string;
};

export async function removeDraftLineItemAction(
  input: RemoveDraftLineItemActionInput,
): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await removeLineItem({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      lineItemId: input.lineItemId,
      actorUserId: actor.userId,
    });
    return { ok: true, draft: result.draft };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}

// ── Lifecycle actions (FAS 7.2b.4d.1) ──────────────────────────

export type SendDraftInvoiceActionResult =
  | {
      ok: true;
      draft: DraftOrder;
      invoiceUrl: string;
      emailStatus: EmailSendResult["status"] | null;
    }
  | { ok: false; error: string };

function composeGuestName(draft: {
  contactFirstName: string | null;
  contactLastName: string | null;
  guestAccount: { firstName: string | null; lastName: string | null } | null;
}): string {
  const first =
    draft.contactFirstName ?? draft.guestAccount?.firstName ?? "";
  const last = draft.contactLastName ?? draft.guestAccount?.lastName ?? "";
  return `${first} ${last}`.trim() || "Kund";
}

export async function sendDraftInvoiceAction(input: {
  draftId: string;
}): Promise<SendDraftInvoiceActionResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    // Pre-fetch for email metadata + frozen-state check.
    const draftBefore = await prisma.draftOrder.findFirst({
      where: { id: input.draftId, tenantId: actor.tenantId },
      select: {
        pricesFrozenAt: true,
        contactEmail: true,
        contactFirstName: true,
        contactLastName: true,
        guestAccountId: true,
        displayNumber: true,
        totalCents: true,
        currency: true,
        expiresAt: true,
      },
    });
    if (!draftBefore) {
      return { ok: false, error: "Utkastet kunde inte hittas" };
    }

    // Step 1: freezePrices when not yet frozen (sendInvoice requires it).
    if (draftBefore.pricesFrozenAt === null) {
      await freezePrices({
        tenantId: actor.tenantId,
        draftOrderId: input.draftId,
        actorUserId: actor.userId,
      });
    }

    // Step 2: sendInvoice — returns invoiceUrl + transitions to INVOICED.
    const invoiceResult = await sendInvoice({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      actorUserId: actor.userId,
    });

    // Step 3: best-effort email send. Failure does NOT abort the action —
    // invoice was successfully sent at the Stripe level. UI surfaces
    // emailStatus so operator can copy the URL manually if needed.
    let emailStatus: EmailSendResult["status"] | null = null;
    const guestAccount = draftBefore.guestAccountId
      ? await prisma.guestAccount.findFirst({
          where: {
            id: draftBefore.guestAccountId,
            tenantId: actor.tenantId,
          },
          select: { email: true, firstName: true, lastName: true },
        })
      : null;
    const recipientEmail =
      draftBefore.contactEmail ?? guestAccount?.email ?? null;

    if (recipientEmail) {
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: actor.tenantId },
        select: { name: true },
      });
      const guestName = composeGuestName({
        contactFirstName: draftBefore.contactFirstName,
        contactLastName: draftBefore.contactLastName,
        guestAccount: guestAccount
          ? {
              firstName: guestAccount.firstName,
              lastName: guestAccount.lastName,
            }
          : null,
      });

      const emailResult = await sendEmailEvent(
        actor.tenantId,
        "DRAFT_INVOICE",
        recipientEmail,
        {
          guestName,
          hotelName: tenantRecord?.name ?? "",
          displayNumber: draftBefore.displayNumber,
          totalAmount: formatSek(draftBefore.totalCents),
          currency: draftBefore.currency,
          invoiceUrl: invoiceResult.invoiceUrl,
          expiresAt: formatSwedishDate(draftBefore.expiresAt),
        },
      );
      emailStatus = emailResult.status;
    }

    return {
      ok: true,
      draft: invoiceResult.draft,
      invoiceUrl: invoiceResult.invoiceUrl,
      emailStatus,
    };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    if (err instanceof ConflictError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function markDraftAsPaidAction(input: {
  draftId: string;
  reference?: string;
}): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await markDraftAsPaid({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      reference: input.reference,
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

export async function cancelDraftAction(input: {
  draftId: string;
  reason?: string;
}): Promise<DraftMutationResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };

  try {
    const result = await cancelDraft({
      tenantId: actor.tenantId,
      draftOrderId: input.draftId,
      reason: input.reason,
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
