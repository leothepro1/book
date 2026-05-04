/**
 * DraftOrder — lifecycle services.
 *
 * FAS 6.5B scope: `freezePrices` only. FAS 6.5D will add
 * `transitionStatus`, `sendInvoice`, `cancelDraft`, `convertToOrder`.
 *
 * `freezePrices` semantics:
 *   - Snapshot current totals into DraftOrder row (subtotalCents /
 *     orderDiscountCents / totalTaxCents / totalCents).
 *   - Snapshot per-line totals into each DraftLineItem row
 *     (taxAmountCents / totalCents).
 *   - Set `DraftOrder.pricesFrozenAt = now`.
 *   - All of the above happen in a single write per row so `version`
 *     increments exactly once.
 *
 * INVARIANT: `convertToOrder` (FAS 6.5D) will REQUIRE `pricesFrozenAt`
 * to be set. It will NOT call `freezePrices` internally — staff must
 * freeze explicitly before converting. See audit §7 for rationale
 * (separation of concerns, UX flow, failure-mode safety).
 *
 * Idempotency: calling `freezePrices` on an already-frozen draft throws
 * `ValidationError("ALREADY_FROZEN")` per operator decision — explicit
 * about state changes, not silent no-op.
 *
 * Empty draft: allowed. All totals freeze to `0n`.
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
import {
  computeDraftTotals,
  type RawDraftOrder,
} from "./calculator";
import { createDraftOrderEventInTx, type DraftEventActorSource } from "./events";
import { persistTaxLinesForDraft } from "./freeze-tax-lines";
import { canTransition } from "./state-machine";
import {
  CancelDraftInputSchema,
  FreezePricesInputSchema,
  SendInvoiceInputSchema,
  getDraftStripePaymentIntentId,
  type CancelDraftArgs,
  type CancelDraftInput,
  type CancelDraftResult,
  type DraftOrder,
  type FreezePricesInput,
  type FreezePricesResult,
  type SendInvoiceArgs,
  type SendInvoiceInput,
  type SendInvoiceResult,
} from "./types";
import { z } from "zod";

type FreezePricesArgs = z.input<typeof FreezePricesInputSchema>;
void ({} as FreezePricesInput);
// Silence unused-import noise — types are imported for surface clarity.
void ({} as SendInvoiceInput);
void ({} as CancelDraftInput);
void ({} as SendInvoiceArgs);
void ({} as CancelDraftArgs);

// ── Helpers ──────────────────────────────────────────────────────

async function loadDraftForFreeze(
  tenantId: string,
  draftOrderId: string,
): Promise<RawDraftOrder> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    include: { lineItems: { orderBy: { position: "asc" } } },
  })) as RawDraftOrder | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

/**
 * Assert the draft is in a freezable state.
 *
 * TODO(FAS 6.5D): extend allowed statuses to include `APPROVED` once
 * that state is reachable via submitForApproval/approve services.
 */
function assertDraftFreezable(draft: RawDraftOrder): void {
  if (draft.status !== "OPEN") {
    throw new ValidationError("Draft is not in a freezable status", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  if (draft.pricesFrozenAt !== null) {
    throw new ValidationError("Draft prices are already frozen", {
      draftOrderId: draft.id,
      pricesFrozenAt: draft.pricesFrozenAt?.toISOString(),
    });
  }
}

// ── freezePrices ─────────────────────────────────────────────────

export async function freezePrices(
  input: FreezePricesArgs,
): Promise<FreezePricesResult> {
  const params = FreezePricesInputSchema.parse(input);

  // Pre-tx: fetch + fast-fail.
  const draft = await loadDraftForFreeze(
    params.tenantId,
    params.draftOrderId,
  );
  assertDraftFreezable(draft);

  const frozenAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Re-validate inside tx (defensive against concurrent freeze attempts).
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as RawDraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftFreezable(fresh);

    // Compute totals via the injected tx (read-only — NOT the persist
    // variant, because we want to combine totals + pricesFrozenAt +
    // version+1 into a single update).
    const totals = await computeDraftTotals(
      draft.tenantId,
      draft.id,
      {},
      tx,
    );

    // Single DraftOrder write — all totals + pricesFrozenAt + version+1.
    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        subtotalCents: totals.subtotalCents,
        orderDiscountCents: totals.orderDiscountCents,
        totalTaxCents: totals.taxCents,
        totalCents: totals.totalCents,
        pricesFrozenAt: frozenAt,
        version: { increment: 1 },
      },
    });

    // Per-line snapshot writes (taxAmountCents + totalCents).
    for (const breakdown of totals.perLine) {
      await tx.draftLineItem.update({
        where: { id: breakdown.lineId },
        data: {
          taxAmountCents: breakdown.taxCents,
          totalCents: breakdown.totalCents,
        },
      });
    }

    // Tax-2 B.4: snapshot per-jurisdiction TaxLine rows in the same tx.
    // Idempotent (Q6 LOCKED) — deleteMany + createMany. Empty
    // taxLines arrays (calculator tier-3 fallback / non-taxable) still
    // run the cleanup so the table stays consistent.
    await persistTaxLinesForDraft(tx, {
      tenantId: draft.tenantId,
      perLine: totals.perLine,
      presentmentCurrency: draft.currency, // Q4 LOCKED: equals shopCurrency
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "PRICES_FROZEN",
      metadata: {
        frozenAt: frozenAt.toISOString(),
        snapshot: {
          subtotalCents: totals.subtotalCents.toString(),
          orderDiscountCents: totals.orderDiscountCents.toString(),
          totalTaxCents: totals.taxCents.toString(),
          totalCents: totals.totalCents.toString(),
        },
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;

    return { draft: refreshed, totals };
  });

  log("info", "draft_order.prices_frozen", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    totalCents: result.totals.totalCents.toString(),
    frozenAt: frozenAt.toISOString(),
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "prices_frozen",
      frozenAt: frozenAt.toISOString(),
      totalCents: result.totals.totalCents.toString(),
      updatedAt: result.draft.updatedAt.toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.updated",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Shape the returned totals as FROZEN_SNAPSHOT so callers see the
  // post-freeze state consistently with future reads.
  return {
    draft: result.draft,
    totals: {
      ...result.totals,
      source: "FROZEN_SNAPSHOT",
      frozenAt,
    },
    frozenAt,
  };
}

// ── FAS 6.5D — transitionDraftStatusInTx ────────────────────────

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

// ── FAS 6.5D — sendInvoice ──────────────────────────────────────

const DEFAULT_SHARE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SHARE_LINK_TTL_MS = 1 * 24 * 60 * 60 * 1000;
const MAX_SHARE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type DraftWithLinesAndReservations = DraftOrder & {
  lineItems: DraftLineItem[];
  reservations: DraftReservation[];
};

/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export type TenantForInvoice = {
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
 * Enforce S1-S6 preconditions — S7 (Stripe readiness) is enforced separately
 * after tenant lookup. See the JSDoc on `SendInvoiceInputSchema` for rationale
 * on S5 (all ACCOMMODATION holds must be PLACED).
 */
function assertSendInvoicePreconditions(
  draft: DraftWithLinesAndReservations,
): void {
  // S2: status gate
  if (draft.status !== "OPEN" && draft.status !== "APPROVED") {
    throw new ValidationError("Draft is not in a sendable status", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  // S3: prices must be frozen first (6.5B hard contract)
  if (draft.pricesFrozenAt === null) {
    throw new ValidationError(
      "Draft prices must be frozen before sending invoice",
      { draftOrderId: draft.id },
    );
  }
  // S4: non-empty draft
  if (draft.lineItems.length === 0) {
    throw new ValidationError("Cannot send invoice for an empty draft", {
      draftOrderId: draft.id,
    });
  }
  // S6: total > 0
  if (draft.totalCents <= BigInt(0)) {
    throw new ValidationError("Cannot send invoice for a zero-total draft", {
      draftOrderId: draft.id,
      totalCents: draft.totalCents.toString(),
    });
  }
  // S5: every ACCOMMODATION line must have a PLACED reservation
  const accLines = draft.lineItems.filter(
    (l) => l.lineType === "ACCOMMODATION",
  );
  if (accLines.length > 0) {
    const reservationByLine = new Map(
      draft.reservations.map((r) => [r.draftLineItemId, r]),
    );
    for (const line of accLines) {
      const r = reservationByLine.get(line.id);
      if (!r) {
        throw new ValidationError(
          "Accommodation line is missing its DraftReservation",
          { draftOrderId: draft.id, draftLineItemId: line.id },
        );
      }
      if (r.holdState !== "PLACED") {
        throw new ValidationError(
          "All accommodation holds must be PLACED before invoicing",
          {
            draftOrderId: draft.id,
            draftLineItemId: line.id,
            holdState: r.holdState,
          },
        );
      }
    }
  }
}

/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export async function loadTenantForInvoice(tenantId: string): Promise<TenantForInvoice> {
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
/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export async function assertTenantStripeReady(tenant: TenantForInvoice): Promise<void> {
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
  // Lazy-loaded so freezePrices and other services that don't touch Stripe
  // can be imported in environments without STRIPE_* env vars (tests).
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

/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export function clampShareLinkTtl(ms?: number): number {
  const raw = ms ?? DEFAULT_SHARE_LINK_TTL_MS;
  if (raw < MIN_SHARE_LINK_TTL_MS) return MIN_SHARE_LINK_TTL_MS;
  if (raw > MAX_SHARE_LINK_TTL_MS) return MAX_SHARE_LINK_TTL_MS;
  return raw;
}

/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export function generateShareLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export function buildInvoiceUrl(portalSlug: string, token: string): string {
  return getTenantUrl({ portalSlug }, { path: `/invoice/${token}` });
}

/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export function mergeMetafields(
  existing: Prisma.JsonValue | null,
  updates: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...updates } as Prisma.InputJsonValue;
}

/**
 * Idempotent re-send: draft is already INVOICED with a stored PaymentIntent.
 * Re-issue a clientSecret against the adapter's PI-lookup path (same
 * sessionId returns the same PI from Stripe), and return the existing
 * invoice metadata without mutating state or emitting webhooks.
 */
async function sendInvoiceIdempotentReplay(
  draft: DraftWithLinesAndReservations,
  storedPaymentIntentId: string,
  tenant: TenantForInvoice,
): Promise<SendInvoiceResult> {
  if (
    !draft.shareLinkToken ||
    !draft.shareLinkExpiresAt ||
    !draft.invoiceUrl
  ) {
    // Inconsistent state — PI stored but invoice artifacts missing. Operator
    // must reconcile manually; refuse to silently re-create.
    throw new ValidationError(
      "Draft has PaymentIntent but missing invoice artifacts — manual recovery required",
      { draftOrderId: draft.id, storedPaymentIntentId },
    );
  }

  const { getPlatformFeeBps } = await import(
    "@/app/_lib/payments/platform-fee"
  );
  const { initiateOrderPayment } = await import(
    "@/app/_lib/payments/providers"
  );
  const feeBps = getPlatformFeeBps(
    tenant.subscriptionPlan,
    tenant.platformFeeBps,
  );

  const init = await initiateOrderPayment({
    order: {
      id: draft.id,
      tenantId: draft.tenantId,
      totalAmount: Number(draft.totalCents),
      currency: draft.currency,
    },
    guest: {
      email: draft.contactEmail ?? "",
      name: `${draft.contactFirstName ?? ""} ${draft.contactLastName ?? ""}`.trim(),
    },
    locale: "sv-SE",
    returnUrl: `${draft.invoiceUrl}/success`,
    cancelUrl: `${draft.invoiceUrl}/cancelled`,
    platformFeeBps: feeBps,
    metadata: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      kind: "draft_order_invoice",
      draftDisplayNumber: draft.displayNumber,
    },
  });

  if (init.mode !== "embedded") {
    throw new ValidationError(
      "Payment adapter returned non-embedded mode for draft invoice",
      { draftOrderId: draft.id },
    );
  }

  log("info", "draft_order.invoice_sent.idempotent_replay", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    stripePaymentIntentId: storedPaymentIntentId,
  });

  return {
    draft,
    invoiceUrl: draft.invoiceUrl,
    shareLinkToken: draft.shareLinkToken,
    shareLinkExpiresAt: draft.shareLinkExpiresAt,
    clientSecret: init.clientSecret,
    stripePaymentIntentId: storedPaymentIntentId,
  };
}

export async function sendInvoice(
  input: SendInvoiceArgs,
): Promise<SendInvoiceResult> {
  const params = SendInvoiceInputSchema.parse(input);

  // Pre-tx: load draft + reservations
  const draft = await loadDraftWithReservations(
    params.tenantId,
    params.draftOrderId,
  );

  // Tenant lookup needed for both replay (URL building) and fresh send.
  const tenant = await loadTenantForInvoice(draft.tenantId);

  // Idempotent replay path — already INVOICED + PI stored.
  const existingPi = getDraftStripePaymentIntentId(draft);
  if (draft.status === "INVOICED" && existingPi !== null) {
    return sendInvoiceIdempotentReplay(draft, existingPi, tenant);
  }

  // Normal flow — S1-S6 preconditions.
  assertSendInvoicePreconditions(draft);

  // S7 — Stripe readiness (includes portalSlug check).
  await assertTenantStripeReady(tenant);
  // From here portalSlug is guaranteed non-null.
  const portalSlug = tenant.portalSlug as string;

  const shareLinkTtlMs = clampShareLinkTtl(params.shareLinkTtlMs);
  const shareLinkToken = generateShareLinkToken();
  const now = new Date();
  const shareLinkExpiresAt = new Date(now.getTime() + shareLinkTtlMs);
  const invoiceUrl = buildInvoiceUrl(portalSlug, shareLinkToken);

  const { getPlatformFeeBps } = await import(
    "@/app/_lib/payments/platform-fee"
  );
  const { initiateOrderPayment } = await import(
    "@/app/_lib/payments/providers"
  );

  const feeBps = getPlatformFeeBps(
    tenant.subscriptionPlan,
    tenant.platformFeeBps,
  );

  // Create Stripe PaymentIntent OUTSIDE the tx — network call may take
  // hundreds of ms. Adapter is idempotent per sessionId=draft.id.
  const init = await initiateOrderPayment({
    order: {
      id: draft.id,
      tenantId: draft.tenantId,
      totalAmount: Number(draft.totalCents),
      currency: draft.currency,
    },
    guest: {
      email: draft.contactEmail ?? "",
      name: `${draft.contactFirstName ?? ""} ${draft.contactLastName ?? ""}`.trim(),
    },
    locale: "sv-SE",
    returnUrl: `${invoiceUrl}/success`,
    cancelUrl: `${invoiceUrl}/cancelled`,
    platformFeeBps: feeBps,
    metadata: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      kind: "draft_order_invoice",
      draftDisplayNumber: draft.displayNumber,
    },
  });

  if (init.mode !== "embedded") {
    throw new ValidationError(
      "Payment adapter returned non-embedded mode for draft invoice",
      { draftOrderId: draft.id },
    );
  }
  if (!init.providerSessionId) {
    throw new ValidationError(
      "Payment adapter did not return providerSessionId (required for draft invoices)",
      { draftOrderId: draft.id },
    );
  }
  const stripePaymentIntentId = init.providerSessionId;
  const clientSecret = init.clientSecret;

  // Tx (fast): re-validate + transition + persist invoice artifacts.
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
    if (fresh.pricesFrozenAt === null) {
      throw new ConflictError(
        "Draft prices are no longer frozen — retry freeze + send",
        { draftOrderId: draft.id },
      );
    }

    const transition = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: fresh.status,
      to: "INVOICED",
      actorUserId: params.actorUserId ?? null,
      actorSource: params.actorSource,
      metadata: {
        invoiceUrl,
        stripePaymentIntentId,
        shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
      },
    });
    if (!transition.transitioned) {
      throw new ConflictError(
        "Draft mutated during send — another request won",
        { draftOrderId: draft.id },
      );
    }

    const mergedMetafields = mergeMetafields(fresh.metafields, {
      stripePaymentIntentId,
    });

    await tx.draftOrder.update({
      where: { id: draft.id },
      data: {
        shareLinkToken,
        shareLinkExpiresAt,
        invoiceUrl,
        invoiceSentAt: now,
        invoiceEmailSubject: params.invoiceEmailSubject ?? null,
        invoiceEmailMessage: params.invoiceEmailMessage ?? null,
        metafields: mergedMetafields,
      },
    });

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "INVOICE_SENT",
      metadata: {
        invoiceUrl,
        stripePaymentIntentId,
        shareLinkExpiresAt: shareLinkExpiresAt.toISOString(),
        totalCents: draft.totalCents.toString(),
        currency: draft.currency,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: params.actorSource,
    });

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
    return refreshed;
  });

  log("info", "draft_order.invoice_sent", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    stripePaymentIntentId,
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
      stripePaymentIntentId,
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
    shareLinkExpiresAt,
    clientSecret,
    stripePaymentIntentId,
  };
}

// ── FAS 6.5D — cancelDraft ──────────────────────────────────────

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

/**
 * Best-effort Stripe PaymentIntent cancellation for drafts that had an
 * invoice sent. Fire-and-forget pattern — if Stripe call fails, the
 * PI will auto-expire server-side and the guest link stops working.
 * Mirrors the approach at `app/api/checkout/payment-intent/route.ts`
 * which tolerates PaymentIntent-cancel failures post-hoc.
 */
/** @internal — re-used by resend-invoice.ts (FAS 7.4). */
export async function tryCancelStripePaymentIntent(
  tenantId: string,
  stripePaymentIntentId: string,
): Promise<{ attempted: true; error: string | null }> {
  try {
    const { getStripe } = await import("@/app/_lib/stripe/client");
    const stripe = getStripe();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const devOrTest =
      process.env.NODE_ENV === "development" ||
      (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
    const connectParams =
      !devOrTest && tenant?.stripeAccountId && tenant.stripeOnboardingComplete
        ? { stripeAccount: tenant.stripeAccountId }
        : undefined;
    await stripe.paymentIntents.cancel(stripePaymentIntentId, connectParams);
    return { attempted: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", "draft_order.cancel.stripe_pi_cancel_failed", {
      tenantId,
      stripePaymentIntentId,
      error: msg,
    });
    return { attempted: true, error: msg };
  }
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

  // Post-commit: best-effort Stripe PI cancel for invoiced drafts.
  let stripePiCancelAttempted = false;
  let stripePiCancelError: string | null = null;
  const storedPi = getDraftStripePaymentIntentId(draft);
  if (storedPi !== null) {
    const piResult = await tryCancelStripePaymentIntent(
      draft.tenantId,
      storedPi,
    );
    stripePiCancelAttempted = piResult.attempted;
    stripePiCancelError = piResult.error;
  }

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

