/**
 * DraftOrder — lifecycle services.
 *
 * Phase C (per `draft-orders-invoice-flow.md` v1.2 §2.1, lazy creation)
 * stripped this module of all eager Stripe / PMS calls. Today it
 * exposes:
 *
 *   - `transitionDraftStatusInTx` — internal helper for status moves
 *   - `sendInvoice` — OPEN/APPROVED → INVOICED, share-link token + URL,
 *     INVOICE_SENT event. Idempotent on status. ZERO external calls.
 *   - `cancelDraft` — non-terminal → CANCELLED, releases PMS holds.
 *
 * Removed in Phase C:
 *   - `freezePrices` — the schema column it wrote (`pricesFrozenAt`)
 *     was dropped in Phase B. Frozen totals now live on
 *     `DraftCheckoutSession` (Phase E).
 *   - `sendInvoiceIdempotentReplay` — the replay path was a workaround
 *     for the eager-PI model. Under lazy creation, calling
 *     `sendInvoice` on an INVOICED draft is a pure read.
 *   - Stripe PI creation / cancellation in `sendInvoice` and
 *     `cancelDraft`. Phase E creates PIs on lazy session creation;
 *     Phase D will wire `unlinkActiveCheckoutSession` into
 *     `cancelDraft`, which is the proper PI-cancel path.
 */

import { randomBytes } from "node:crypto";
import type {
  Prisma,
  DraftOrderStatus,
  DraftLineItem,
  DraftReservation,
} from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import { getTenantUrl } from "@/app/_lib/tenant/tenant-url";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { createDraftOrderEventInTx, type DraftEventActorSource } from "./events";
import { canTransition } from "./state-machine";
import {
  CancelDraftInputSchema,
  SendInvoiceInputSchema,
  type CancelDraftArgs,
  type CancelDraftInput,
  type CancelDraftResult,
  type DraftOrder,
  type SendInvoiceArgs,
  type SendInvoiceInput,
  type SendInvoiceResult,
} from "./types";

// Silence unused-import noise — types are imported for surface clarity.
void ({} as SendInvoiceInput);
void ({} as CancelDraftInput);
void ({} as SendInvoiceArgs);
void ({} as CancelDraftArgs);

// ── Helpers ──────────────────────────────────────────────────────

// ── transitionDraftStatusInTx ───────────────────────────────────

/**
 * Internal helper: atomically transition a DraftOrder's status inside a
 * caller-owned transaction. Writes a STATE_CHANGED event in the same tx
 * and bumps `version`. Race-safe via `updateMany` with a `from` filter —
 * a concurrent mutation (another service / tab) returns `{ transitioned:
 * false }` without throwing, so callers can make a policy decision.
 *
 * NOT exported via the barrel — used only by sendInvoice, cancelDraft,
 * convertDraftToOrder, and the Stripe webhook bridge. External callers
 * should go through a specific service.
 *
 * Throws `ValidationError("INVALID_TRANSITION")` if the requested edge
 * is not in `DRAFT_TRANSITIONS` — that's a programming error, not a race.
 */
export async function transitionDraftStatusInTx(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    draftOrderId: string;
    from: DraftOrderStatus;
    to: DraftOrderStatus;
    actorUserId?: string | null;
    actorSource?: DraftEventActorSource;
    /** Extra fields merged into the STATE_CHANGED event metadata. */
    metadata?: Prisma.InputJsonValue;
  },
): Promise<{ transitioned: boolean }> {
  if (!canTransition(params.from, params.to)) {
    throw new ValidationError("INVALID_TRANSITION", {
      draftOrderId: params.draftOrderId,
      from: params.from,
      to: params.to,
    });
  }

  const updated = await tx.draftOrder.updateMany({
    where: {
      id: params.draftOrderId,
      tenantId: params.tenantId,
      status: params.from,
    },
    data: {
      status: params.to,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    return { transitioned: false };
  }

  const extra =
    params.metadata === undefined
      ? {}
      : typeof params.metadata === "object" && params.metadata !== null && !Array.isArray(params.metadata)
        ? (params.metadata as Record<string, unknown>)
        : { value: params.metadata };

  await createDraftOrderEventInTx(tx, {
    tenantId: params.tenantId,
    draftOrderId: params.draftOrderId,
    type: "STATE_CHANGED",
    metadata: {
      from: params.from,
      to: params.to,
      ...extra,
    } as Prisma.InputJsonValue,
    actorUserId: params.actorUserId ?? null,
    actorSource: params.actorSource ?? "admin_ui",
  });

  return { transitioned: true };
}

// ── sendInvoice ─────────────────────────────────────────────────

const DEFAULT_SHARE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SHARE_LINK_TTL_MS = 1 * 24 * 60 * 60 * 1000;
const MAX_SHARE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type DraftWithLinesAndReservations = DraftOrder & {
  lineItems: DraftLineItem[];
  reservations: DraftReservation[];
};

type TenantForInvoice = {
  id: string;
  portalSlug: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  subscriptionPlan: "BASIC" | "GROW" | "PRO";
  platformFeeBps: number | null;
};

async function loadDraftWithReservations(
  tenantId: string,
  draftOrderId: string,
): Promise<DraftWithLinesAndReservations> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    include: { lineItems: true, reservations: true },
  })) as DraftWithLinesAndReservations | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

/**
 * Phase C preconditions for `sendInvoice` (v1.2 §2.1, lazy creation):
 *
 *   S1 — status is OPEN or APPROVED
 *   S2 — draft has at least one line item
 *   S4 — total is non-negative (zero-total invoices are rejected to
 *        avoid accidental empty-bill sends)
 *   S5 — at least one customer-association field is set so the
 *        action layer can resolve a recipient email
 *
 * Dropped versus the eager-PI model (Phase B → C migration):
 *   - S3 (pricesFrozenAt) — column was deleted in Phase B; frozen
 *     totals now live on `DraftCheckoutSession` (Phase E)
 *   - S5-old (accommodation holds PLACED) — moves to
 *     `createDraftCheckoutSession` in Phase E §7.3 step 3
 *   - S6 (Stripe readiness) — same, moves to Phase E §7.3 step 4
 */
function assertSendInvoicePreconditions(
  draft: DraftWithLinesAndReservations,
): void {
  // S1: status gate
  if (draft.status !== "OPEN" && draft.status !== "APPROVED") {
    throw new ValidationError("Draft is not in a sendable status", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  // S2: non-empty draft
  if (draft.lineItems.length === 0) {
    throw new ValidationError("Cannot send invoice for an empty draft", {
      draftOrderId: draft.id,
    });
  }
  // S4: total > 0
  if (draft.totalCents <= BigInt(0)) {
    throw new ValidationError("Cannot send invoice for a zero-total draft", {
      draftOrderId: draft.id,
      totalCents: draft.totalCents.toString(),
    });
  }
  // S5: customer-association — at least one of contactEmail,
  // guestAccountId, or companyContactId must be present so the action
  // layer has a recipient to email.
  const hasCustomer =
    (draft.contactEmail !== null && draft.contactEmail !== "") ||
    draft.guestAccountId !== null ||
    draft.companyContactId !== null;
  if (!hasCustomer) {
    throw new ValidationError(
      "Cannot send invoice without a customer association",
      {
        draftOrderId: draft.id,
        buyerKind: draft.buyerKind,
      },
    );
  }
}

async function loadTenantForInvoice(tenantId: string): Promise<TenantForInvoice> {
  const tenant = (await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      portalSlug: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      subscriptionPlan: true,
      platformFeeBps: true,
    },
  })) as TenantForInvoice | null;
  if (!tenant) {
    throw new NotFoundError("Tenant not found", { tenantId });
  }
  return tenant;
}

/** S7 — tenant must have working Stripe Connect and a portal slug. */
async function assertTenantStripeReady(tenant: TenantForInvoice): Promise<void> {
  if (!tenant.stripeAccountId) {
    throw new ValidationError("Tenant has no Stripe Connect account", {
      tenantId: tenant.id,
    });
  }
  if (!tenant.stripeOnboardingComplete) {
    throw new ValidationError("Tenant Stripe onboarding is not complete", {
      tenantId: tenant.id,
    });
  }
  if (!tenant.portalSlug) {
    throw new ValidationError(
      "Tenant has no portalSlug — cannot build invoice URL",
      { tenantId: tenant.id },
    );
  }
  // Lazy-loaded so services that don't touch Stripe (e.g. sendInvoice
  // post-Phase C) can be imported in environments without STRIPE_*
  // env vars (tests). Phase E will be the first caller of this helper
  // when it pre-checks Stripe before lazy-creating the checkout session.
  const { verifyChargesEnabled } = await import(
    "@/app/_lib/stripe/verify-account"
  );
  const chargesOk = await verifyChargesEnabled(tenant.stripeAccountId);
  if (!chargesOk) {
    throw new ValidationError(
      "Tenant Stripe account cannot accept charges",
      { tenantId: tenant.id },
    );
  }
}

function clampShareLinkTtl(ms?: number): number {
  const raw = ms ?? DEFAULT_SHARE_LINK_TTL_MS;
  if (raw < MIN_SHARE_LINK_TTL_MS) return MIN_SHARE_LINK_TTL_MS;
  if (raw > MAX_SHARE_LINK_TTL_MS) return MAX_SHARE_LINK_TTL_MS;
  return raw;
}

function generateShareLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

function buildInvoiceUrl(portalSlug: string, token: string): string {
  return getTenantUrl({ portalSlug }, { path: `/invoice/${token}` });
}

export async function sendInvoice(
  input: SendInvoiceArgs,
): Promise<SendInvoiceResult> {
  const params = SendInvoiceInputSchema.parse(input);

  // Pre-tx: load draft (with lineItems for S2; reservations are loaded
  // by the shared helper for cancelDraft's benefit and ignored here).
  const draft = await loadDraftWithReservations(
    params.tenantId,
    params.draftOrderId,
  );

  // Idempotent re-send: draft is already INVOICED. Return the existing
  // share-link without state mutation, event emission, or post-commit
  // webhook. Re-sending the email itself is the action layer's
  // responsibility (`sendDraftInvoiceAction`).
  if (draft.status === "INVOICED") {
    if (!draft.shareLinkToken || !draft.invoiceUrl) {
      // Data integrity: an INVOICED draft must have both fields.
      throw new ValidationError(
        "INVOICED draft is missing shareLinkToken or invoiceUrl — manual recovery required",
        { draftOrderId: draft.id },
      );
    }
    return {
      draft,
      invoiceUrl: draft.invoiceUrl,
      shareLinkToken: draft.shareLinkToken,
    };
  }

  // Fresh-send path: validate S1, S2, S4, S5.
  assertSendInvoicePreconditions(draft);

  // Tenant lookup for portalSlug. Stripe-readiness checks are deferred
  // to `createDraftCheckoutSession` (Phase E) — `sendInvoice` itself
  // makes no Stripe call.
  const tenant = await loadTenantForInvoice(draft.tenantId);
  if (!tenant.portalSlug) {
    throw new ValidationError(
      "Tenant has no portalSlug — cannot build invoice URL",
      { tenantId: tenant.id },
    );
  }
  const portalSlug = tenant.portalSlug;

  const shareLinkTtlMs = clampShareLinkTtl(params.shareLinkTtlMs);
  const shareLinkToken = generateShareLinkToken();
  const now = new Date();
  const shareLinkExpiresAt = new Date(now.getTime() + shareLinkTtlMs);
  const invoiceUrl = buildInvoiceUrl(portalSlug, shareLinkToken);

  // Tx: re-validate status + transition + persist invoice artifacts +
  // emit INVOICE_SENT event. All-or-nothing.
  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    if (fresh.status !== "OPEN" && fresh.status !== "APPROVED") {
      throw new ConflictError(
        "Draft status changed between validation and send",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }

    const transition = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: fresh.status,
      to: "INVOICED",
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
      metadata: {
        invoiceUrl,
        shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
      },
    });
    if (!transition.transitioned) {
      throw new ConflictError(
        "Draft mutated during send — another request won",
        { draftOrderId: draft.id },
      );
    }

    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        shareLinkToken,
        shareLinkExpiresAt,
        invoiceUrl,
        invoiceSentAt: now,
        invoiceEmailSubject: params.invoiceEmailSubject ?? null,
        invoiceEmailMessage: params.invoiceEmailMessage ?? null,
      },
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "INVOICE_SENT",
      metadata: {
        invoiceUrl,
        shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
        totalCents: draft.totalCents.toString(),
        currency: draft.currency,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
    return refreshed;
  });

  log("info", "draft_order.invoice_sent", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    totalCents: draft.totalCents.toString(),
    invoiceUrl,
  });

  emitPlatformEvent({
    type: "draft_order.invoiced",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.displayNumber,
      invoiceUrl,
      totalCents: draft.totalCents.toString(),
      currency: draft.currency,
      shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
      invoiceSentAt: now.toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.invoiced",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    draft: result,
    invoiceUrl,
    shareLinkToken,
  };
}

// ── cancelDraft ─────────────────────────────────────────────────

/**
 * Hold release is best-effort: a DraftReservation is classified as
 * "releasable" iff holdState ∈ {PLACED, FAILED}. PLACING rows are
 * skipped — they'll resolve via the release-expired-draft-holds cron
 * (FAS 6.5C Sweep B). CONFIRMED / RELEASED / NOT_PLACED are no-ops.
 */
function isReleasableHoldState(
  s: DraftReservation["holdState"],
): boolean {
  return s === "PLACED" || s === "FAILED";
}

export async function cancelDraft(
  input: CancelDraftArgs,
): Promise<CancelDraftResult> {
  const params = CancelDraftInputSchema.parse(input);

  // Pre-tx: fetch draft + reservations.
  const draft = await loadDraftWithReservations(
    params.tenantId,
    params.draftOrderId,
  );

  // C2 — reject if already terminal.
  if (draft.status === "COMPLETED" || draft.status === "CANCELLED") {
    throw new ValidationError("Draft is already in a terminal status", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }

  // C3 — reject PAID drafts. Refund handling is out of 6.5D scope.
  // Admin must issue the Stripe refund manually, then re-run cancelDraft
  // (which will succeed once draft.status has been manually transitioned
  // back to a non-PAID status via admin tooling).
  if (draft.status === "PAID") {
    throw new ValidationError(
      "Cannot cancel a PAID draft — refund via Stripe, then retry",
      { draftOrderId: draft.id },
    );
  }

  // C4 — reason required for post-invoice cancels.
  if (
    (draft.status === "INVOICED" || draft.status === "OVERDUE") &&
    (!params.reason || params.reason.trim().length === 0)
  ) {
    throw new ValidationError(
      "Cancellation reason required for INVOICED / OVERDUE drafts",
      { draftOrderId: draft.id, status: draft.status },
    );
  }

  // Release holds OUTSIDE tx — adapter calls may take seconds.
  // Per-line errors are logged + collected, never abort the cancel.
  const holdReleaseErrors: Array<{ draftLineItemId: string; error: string }> = [];
  let releasedHolds = 0;
  const releasableReservations = draft.reservations.filter((r) =>
    isReleasableHoldState(r.holdState),
  );
  const { releaseHoldForDraftLine } =
    releasableReservations.length > 0
      ? await import("./holds")
      : { releaseHoldForDraftLine: undefined as never };
  for (const r of releasableReservations) {
    try {
      await releaseHoldForDraftLine({
        tenantId: params.tenantId,
        draftLineItemId: r.draftLineItemId,
        actorUserId: params.actorUserId,
        source: "draft_cancelled",
      });
      releasedHolds += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      holdReleaseErrors.push({
        draftLineItemId: r.draftLineItemId,
        error: msg,
      });
      log("warn", "draft_order.cancel.hold_release_failed", {
        tenantId: params.tenantId,
        draftOrderId: draft.id,
        draftLineItemId: r.draftLineItemId,
        error: msg,
      });
    }
  }

  // Tx (fast): re-validate + transition + stamp cancellation fields.
  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    if (fresh.status === "COMPLETED" || fresh.status === "CANCELLED") {
      throw new ConflictError(
        "Draft reached terminal status during cancel",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }
    if (fresh.status === "PAID") {
      throw new ConflictError(
        "Draft transitioned to PAID during cancel — refund required",
        { draftOrderId: draft.id },
      );
    }

    const transition = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: fresh.status,
      to: "CANCELLED",
      actorUserId: params.actorUserId ?? null,
      actorSource: params.actorSource,
      metadata: {
        reason: params.reason ?? null,
        previousStatus: fresh.status,
      },
    });
    if (!transition.transitioned) {
      throw new ConflictError(
        "Draft mutated during cancel — retry",
        { draftOrderId: draft.id },
      );
    }

    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        cancelledAt: new Date(),
        cancellationReason: params.reason ?? null,
      },
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "CANCELLED",
      metadata: {
        reason: params.reason ?? null,
        previousStatus: fresh.status,
        releasedHolds,
        holdReleaseErrorCount: holdReleaseErrors.length,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: params.actorSource,
    });

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
    return refreshed;
  });

  // TODO: Phase D — call `unlinkActiveCheckoutSession` here to cancel
  // the live `DraftCheckoutSession` (and its Stripe PaymentIntent +
  // PMS hold) atomically with the draft cancellation. Phase C cannot
  // do this because (a) the session model isn't wired into any service
  // yet (Phase E), and (b) the unlink helper itself doesn't exist yet
  // (Phase D). Phase B verified production has zero drafts with PIs,
  // so the regression window is empty.
  const stripePiCancelAttempted = false;
  const stripePiCancelError: string | null = null;

  log("info", "draft_order.cancelled", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    previousStatus: draft.status,
    releasedHolds,
    holdReleaseErrors: holdReleaseErrors.length,
    stripePiCancelAttempted,
    reason: params.reason ?? null,
  });

  emitPlatformEvent({
    type: "draft_order.cancelled",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.displayNumber,
      previousStatus: draft.status,
      reason: params.reason ?? null,
      cancelledAt: (result.cancelledAt ?? new Date()).toISOString(),
      releasedHolds,
      holdReleaseErrorCount: holdReleaseErrors.length,
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.cancelled",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    draft: result,
    releasedHolds,
    holdReleaseErrors,
    stripePaymentIntentCancelAttempted: stripePiCancelAttempted,
    stripePaymentIntentCancelError: stripePiCancelError,
  };
}

