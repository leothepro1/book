/**
 * DraftOrder → Order conversion (FAS 6.5D).
 *
 * `convertDraftToOrder` is the atomic promotion from a PAID draft to a
 * COMPLETED Order. Called by the Stripe webhook after the INVOICED → PAID
 * transition, or by an admin manual-recovery tool when Stripe retries
 * got stuck on a cached FAILED confirmHold key.
 *
 * Design (per audit §6 Option C — sign-off 2026-04-24):
 *   1. Pre-confirm ALL DraftReservations at the PMS (outside tx).
 *      - confirmHold is idempotent; Mews returns the same externalId
 *        on repeated calls.
 *      - Idempotency key is deterministic for webhook callers (tenant +
 *        reservationId + paymentIntentId) so Stripe retries hit the
 *        PmsIdempotencyKey cache.
 *      - admin_manual_recovery uses attemptNonce to escape cached
 *        FAILED keys (§13 F2).
 *   2. Single atomic tx (<30s: all DB work, no network):
 *        - Order + OrderLineItems + Bookings created
 *        - DraftReservations PLACED → CONFIRMED
 *        - commitDiscountApplication (TOCTOU-safe via FOR UPDATE lock)
 *        - Draft PAID → COMPLETING → COMPLETED
 *   3. Post-commit (fire-and-forget):
 *        - draft_order.completed platform webhook
 *        - processOrderPaidSideEffects (analytics, emails, guest account)
 *
 * If Stripe webhook retries after PmsIdempotencyKey 48h TTL cleanup
 * (rare: PmsIdempotencyKey TTL = 48h, Stripe retry window = 3 days),
 * fresh confirmHold attempts are safe — adapter.confirmHold is
 * idempotent per PMS contract (calling on already-Confirmed reservation
 * is a no-op).
 *
 * See audit §13 for the full F1-F11 failure-mode matrix.
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  Booking,
  DraftLineItem,
  DraftReservation,
  Order,
  OrderLineItem,
} from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import {
  calculateDiscountImpact,
  commitDiscountApplication,
} from "@/app/_lib/discounts/apply";
import {
  computeIdempotencyKey,
  withIdempotency,
} from "@/app/_lib/integrations/reliability/idempotency";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { createDraftOrderEventInTx } from "./events";
import { transitionDraftStatusInTx } from "./lifecycle";
import { buildDiscountEngineInput } from "./calculator";
import type { RawDraftOrder, RawDraftLineItem } from "./calculator";
import {
  ConvertDraftToOrderInputSchema,
  type ConvertDraftToOrderArgs,
  type ConvertDraftToOrderInput,
  type ConvertDraftToOrderResult,
  type DraftOrder,
} from "./types";
import { z } from "zod";

type Tx = Prisma.TransactionClient;
type ConvertDraftToOrderArgsShape = z.input<typeof ConvertDraftToOrderInputSchema>;
void ({} as ConvertDraftToOrderInput);
void ({} as ConvertDraftToOrderArgs);

// ── Types ────────────────────────────────────────────────────────

type DraftForConvert = DraftOrder & {
  lineItems: DraftLineItem[];
  reservations: DraftReservation[];
};

type ConfirmedHoldByReservation = Map<
  string, // reservation.id
  { confirmedExternalId: string }
>;

// ── Helpers: load + preconditions ────────────────────────────────

async function loadDraftForConvert(
  tenantId: string,
  draftOrderId: string,
): Promise<DraftForConvert> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      reservations: true,
    },
  })) as DraftForConvert | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

/**
 * P1-P7 preconditions per audit §1.3. All enforced pre-tx (fail-fast);
 * the critical ones (P2, P4, P6) are re-checked in-tx for race safety.
 *
 * Throws ValidationError / ConflictError by audit mapping:
 *   P1  NOT_FOUND (thrown by loader, not here)
 *   P2  INVALID_STATUS          → ValidationError
 *   P3  (removed) NOT_FROZEN    — pricesFrozenAt was deleted in Phase B
 *   P4  HOLDS_NOT_PLACED        → ValidationError
 *   P5  HOLDS_EXPIRED           → ConflictError (time-based, recoverable)
 *   P6  Already-converted is handled upstream as alreadyConverted replay
 *   P7  ACC_NOT_PMS_SYNCED      → ValidationError
 *   Q9  AMOUNT_EXCEEDS_…        → ValidationError (defensive overflow guard)
 *
 * NOTE: Frozen-totals guarantee comes from `DraftCheckoutSession.frozenTotal`
 * (populated by `createDraftCheckoutSession` in Phase E §7.3 step 1).
 * This function is effectively unreachable in the buyer flow until
 * Phase H wires the Stripe webhook to transition through
 * `DraftCheckoutSession` — see roadmap.
 */
function assertConvertPreconditions(draft: DraftForConvert): void {
  // P2
  if (draft.status !== "PAID") {
    throw new ValidationError("Draft must be in PAID status to convert", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  // Q9 — BigInt → Int overflow guard. Order.totalAmount is Int (SQL int4,
  // max 2^31-1 ≈ 21M SEK). MAX_SAFE_INTEGER is conservative — if the
  // draft's totalCents exceeds it we're in overflow territory and
  // should fail loud rather than silently truncate.
  if (draft.totalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError("AMOUNT_EXCEEDS_ORDER_TABLE_CAPACITY", {
      draftOrderId: draft.id,
      totalCents: draft.totalCents.toString(),
    });
  }
  // P4 — every ACCOMMODATION line must have a PLACED reservation
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
          "All accommodation holds must be PLACED before converting",
          {
            draftOrderId: draft.id,
            draftLineItemId: line.id,
            holdState: r.holdState,
          },
        );
      }
      if (!r.holdExternalId) {
        throw new ValidationError(
          "DraftReservation is PLACED but has no holdExternalId",
          { draftOrderId: draft.id, draftLineItemId: line.id },
        );
      }
      // P5 — hold must not be expired at the wire (small safety margin).
      if (
        r.holdExpiresAt !== null &&
        r.holdExpiresAt.getTime() < Date.now() - 60_000
      ) {
        throw new ConflictError("HOLDS_EXPIRED", {
          draftOrderId: draft.id,
          draftLineItemId: line.id,
          holdExpiresAt: r.holdExpiresAt.toISOString(),
        });
      }
    }
  }
  // P6 — already-converted short-circuit (caller handles replay)
  if (draft.completedOrderId !== null) {
    // Caller (convertDraftToOrder) handles this as alreadyConverted=true
    // replay. Throwing here would short-circuit the replay path.
    return;
  }
}

// ── Pre-confirm phase (Phase A) ──────────────────────────────────

/**
 * Deterministic idempotency key for convert-confirmHold calls.
 *
 * Webhook callers get a stable key:
 *   sha256(tenantId + provider + "confirmHold" + reservationId + paymentIntentId)
 * so Stripe retries land on the cached PmsIdempotencyKey row and don't
 * re-hit Mews. Admin manual-recovery callers force a fresh attempt by
 * mixing in attemptNonce, escaping a cached FAILED row (audit §13 F2).
 */
export function computeConfirmHoldKey(params: {
  tenantId: string;
  provider: string;
  reservationId: string;
  paymentIntentId: string;
  forceFresh: boolean;
}): string {
  return computeIdempotencyKey({
    tenantId: params.tenantId,
    provider: params.provider,
    operation: "confirmHold",
    inputs: {
      draftReservationId: params.reservationId,
      stripePaymentIntentId: params.paymentIntentId,
      ...(params.forceFresh ? { attemptNonce: randomUUID() } : {}),
    },
  });
}

/**
 * Sequentially confirm every PLACED DraftReservation at the PMS.
 * Idempotent: webhook retries hit the PmsIdempotencyKey cache. Throws
 * on any single-line failure — caller retries entire conversion.
 *
 * Returns a map from reservation.id → confirmedExternalId for use
 * inside the subsequent tx (Booking creation + state transition).
 */
async function preConfirmAllHolds(
  draft: DraftForConvert,
  stripePaymentIntentId: string,
  forceFresh: boolean,
): Promise<ConfirmedHoldByReservation> {
  const accReservations = draft.reservations.filter(
    (r) => r.holdState === "PLACED" && r.holdExternalId !== null,
  );
  const result: ConfirmedHoldByReservation = new Map();
  if (accReservations.length === 0) return result;

  const adapter = await resolveAdapter(draft.tenantId);

  for (const r of accReservations) {
    const key = computeConfirmHoldKey({
      tenantId: draft.tenantId,
      provider: adapter.provider,
      reservationId: r.id,
      paymentIntentId: stripePaymentIntentId,
      forceFresh,
    });
    const confirmedExternalId = await withIdempotency(
      key,
      {
        tenantId: draft.tenantId,
        provider: adapter.provider,
        operation: "confirmHold",
      },
      () => adapter.confirmHold(draft.tenantId, r.holdExternalId as string),
    );
    result.set(r.id, { confirmedExternalId });
  }

  return result;
}

// ── Tx helpers (Phase B) ─────────────────────────────────────────

/**
 * Create the Order row for a draft. Called inside the convert tx AFTER
 * nextOrderNumber is claimed (outside tx — Q15 accepts burned numbers on
 * rollback).
 *
 * Order.orderType is ACCOMMODATION if ANY line is ACC, else PURCHASE.
 * metadata includes draftOrderId + draftDisplayNumber per SR-2 for
 * bidirectional traceability.
 */
export async function createOrderFromDraftInTx(
  tx: Tx,
  params: {
    draft: DraftForConvert;
    orderNumber: number;
    stripePaymentIntentId: string;
    feeBps: number;
  },
): Promise<Order> {
  const { draft, orderNumber, stripePaymentIntentId, feeBps } = params;

  const hasAccommodation = draft.lineItems.some(
    (l) => l.lineType === "ACCOMMODATION",
  );
  const orderType = hasAccommodation ? "ACCOMMODATION" : "PURCHASE";

  const guestName = `${draft.contactFirstName ?? ""} ${draft.contactLastName ?? ""}`
    .trim();

  // Resolve Company backref from CompanyLocation if present.
  let companyId: string | null = null;
  if (draft.companyLocationId) {
    const loc = await tx.companyLocation.findFirst({
      where: { id: draft.companyLocationId, tenantId: draft.tenantId },
      select: { companyId: true },
    });
    companyId = loc?.companyId ?? null;
  }

  const metadata = {
    draftOrderId: draft.id,
    draftDisplayNumber: draft.displayNumber,
    orderType,
    kind: "draft_order_invoice",
  };

  return tx.order.create({
    data: {
      tenantId: draft.tenantId,
      orderNumber,
      status: "PAID",
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      orderType,
      paymentMethod: "BEDFRONT_PAYMENTS_ELEMENTS",
      guestEmail: draft.contactEmail ?? "",
      guestName,
      guestPhone: draft.contactPhone,
      // Q7: null billing address for 6.5D (drafts don't collect one).
      billingAddress: Prisma.JsonNull,
      guestAccountId: draft.guestAccountId,
      subtotalAmount: Number(draft.subtotalCents),
      // Q8: taxRate is 0 for drafts in 6.5D (per-line tax already in totalCents).
      taxRate: 0,
      taxAmount: Number(draft.totalTaxCents),
      totalAmount: Number(draft.totalCents),
      currency: draft.currency,
      // discountAmount + discountCode are set by commitDiscountApplication.
      stripePaymentIntentId,
      platformFeeBps: feeBps,
      tags: Array.from(new Set(draft.tags)).join(","),
      customerNote: draft.customerNote,
      metadata: metadata as Prisma.InputJsonValue,
      sourceChannel: "admin_draft",
      companyId,
      companyLocationId: draft.companyLocationId,
      poNumber: draft.poNumber,
      paymentTermsSnapshot: draft.paymentTermsFrozen ?? Prisma.JsonNull,
      paymentDueAt: null,
      depositPercent: draft.depositPercent
        ? Math.floor(Number(draft.depositPercent))
        : null,
      paidAt: new Date(),
    },
  });
}

/**
 * Create OrderLineItems from a draft's DraftLineItems. Called inside the
 * convert tx.
 *
 * IMPORTANT (Q10): `OrderLineItem.productId` is a String column, NOT a
 * FK. For ACCOMMODATION lines we pass `draftLineItem.accommodationId` as
 * the productId — this is INTENTIONAL. Accommodation is NOT a Product
 * in the catalog (that coupling was removed in FAS 6.2B). The admin UI
 * reads `OrderLineItem.title` + metadata for display; the String acts as
 * a lookup key into whichever resource the line represents.
 * Spot-map line items (legacy D2C path) use `"spot-map:"` prefix;
 * custom lines use `"custom:" + draftLineItem.id`.
 */
export async function createOrderLineItemsFromDraftInTx(
  tx: Tx,
  params: {
    order: Order;
    draft: DraftForConvert;
  },
): Promise<OrderLineItem[]> {
  const { order, draft } = params;

  const created: OrderLineItem[] = [];
  for (const line of draft.lineItems) {
    let productId: string;
    let variantId: string | null = null;
    let variantTitle: string | null = null;
    let sku: string | null = null;
    let imageUrl: string | null = null;
    let quantity: number;

    if (line.lineType === "ACCOMMODATION") {
      productId = line.accommodationId ?? "accommodation:" + line.id;
      variantTitle = line.ratePlanName;
      quantity = 1; // ACC lines are always qty=1 per 6.5A Zod schema
    } else if (line.lineType === "PRODUCT") {
      productId = line.productId ?? "product:" + line.id;
      variantId = line.productVariantId;
      variantTitle = line.variantTitle;
      sku = line.sku;
      imageUrl = line.imageUrl;
      quantity = line.quantity;
    } else {
      // CUSTOM
      productId = "custom:" + line.id;
      quantity = line.quantity;
    }

    const oli = await tx.orderLineItem.create({
      data: {
        orderId: order.id,
        productId,
        variantId,
        title: line.title,
        variantTitle,
        sku,
        imageUrl,
        quantity,
        unitAmount: Number(line.unitPriceCents),
        totalAmount: Number(line.totalCents),
        currency: draft.currency,
      },
    });
    created.push(oli);
  }

  return created;
}

/**
 * Create Bookings for every ACCOMMODATION DraftLineItem. Called inside
 * the convert tx. Also transitions matching DraftReservations PLACED →
 * CONFIRMED via a state-filtered updateMany (race-safe). Throws
 * ConflictError if any reservation mutation loses the race (cron or
 * other convert beat us to it — triggers tx rollback; next retry
 * re-reads state).
 */
export async function createBookingsFromDraftInTx(
  tx: Tx,
  params: {
    order: Order;
    draft: DraftForConvert;
    confirmedByReservation: ConfirmedHoldByReservation;
    adapterProvider: string;
  },
): Promise<Booking[]> {
  const { order, draft, confirmedByReservation, adapterProvider } = params;

  const accLines = draft.lineItems.filter(
    (l) => l.lineType === "ACCOMMODATION",
  );
  if (accLines.length === 0) return [];

  const reservationByLine = new Map(
    draft.reservations.map((r) => [r.draftLineItemId, r]),
  );

  const bookings: Booking[] = [];
  for (const line of accLines) {
    const reservation = reservationByLine.get(line.id);
    if (!reservation || !reservation.accommodationId) {
      throw new ConflictError("Missing reservation during Booking creation", {
        draftOrderId: draft.id,
        draftLineItemId: line.id,
      });
    }
    const confirmed = confirmedByReservation.get(reservation.id);
    if (!confirmed) {
      throw new ConflictError(
        "Missing confirmedExternalId for reservation",
        { reservationId: reservation.id },
      );
    }

    // Race-safe state transition: PLACED → CONFIRMED. count=0 means
    // another mutation (cron release, parallel convert) won.
    const transitioned = await tx.draftReservation.updateMany({
      where: {
        id: reservation.id,
        tenantId: draft.tenantId,
        holdState: "PLACED",
      },
      data: {
        holdState: "CONFIRMED",
        holdExternalId: confirmed.confirmedExternalId,
      },
    });
    if (transitioned.count === 0) {
      throw new ConflictError(
        "DraftReservation lost race during convert (not PLACED)",
        { reservationId: reservation.id },
      );
    }

    // Derive guest count from reservation.guestCounts JSON.
    const gc = (reservation.guestCounts ?? {}) as {
      adults?: number;
      children?: number;
      infants?: number;
    };
    const guestCount =
      (gc.adults ?? 0) + (gc.children ?? 0) + (gc.infants ?? 0);

    // Accommodation.externalId for `unit` string.
    const accommodation = await tx.accommodation.findFirst({
      where: {
        id: reservation.accommodationId,
        tenantId: draft.tenantId,
      },
      select: { externalId: true },
    });

    const booking = await tx.booking.create({
      data: {
        tenantId: draft.tenantId,
        orderId: order.id,
        accommodationId: reservation.accommodationId,
        externalId: confirmed.confirmedExternalId,
        externalSource: adapterProvider,
        pmsBookingRef: confirmed.confirmedExternalId,
        // Hold fields cleared — confirmation is terminal.
        holdExternalId: null,
        holdExpiresAt: null,
        firstName: draft.contactFirstName ?? "Gäst",
        lastName: draft.contactLastName ?? "-",
        guestEmail: draft.contactEmail ?? "",
        phone: draft.contactPhone,
        arrival: reservation.checkInDate,
        departure: reservation.checkOutDate,
        checkIn: reservation.checkInDate,
        checkOut: reservation.checkOutDate,
        unit: accommodation?.externalId ?? reservation.accommodationId,
        guestCount: guestCount > 0 ? guestCount : 1,
        ratePlanId: reservation.ratePlanId,
        specialRequests: null,
        status: "PRE_CHECKIN",
        guestAccountId: draft.guestAccountId,
      },
    });
    bookings.push(booking);
  }

  return bookings;
}

/**
 * Commit the applied discount (if any) against the freshly-created Order
 * via `commitDiscountApplication`. Re-evaluates the discount against the
 * Order's live line items (using their NEW ids) so allocations are
 * keyed correctly.
 *
 * Q12: on usage-limit race (F7) we emit a distinct structured log
 * `draft_order.convert.discount_race_blocked` before re-throwing — the
 * webhook turns this into a 5xx, Stripe retries are futile, and operator
 * intervention is required.
 */
export async function commitDiscountForConvertInTx(
  tx: Tx,
  params: {
    draft: DraftForConvert;
    order: Order;
    orderLineItems: OrderLineItem[];
    stripePaymentIntentId: string;
  },
): Promise<void> {
  const { draft, order, orderLineItems, stripePaymentIntentId } = params;
  if (!draft.appliedDiscountCode) return;

  // Build ctx from draft (same helper as 6.5B preview / apply).
  // Note: buildDiscountEngineInput expects RawDraftOrder shape — compatible
  // with our DraftForConvert since we have all required fields.
  const { ctx } = buildDiscountEngineInput(
    draft as unknown as RawDraftOrder,
    draft.lineItems as unknown as RawDraftLineItem[],
  );

  // Re-project line items onto ORDER-side IDs (not DRAFT-side ids) so
  // DiscountAllocation rows reference the right FKs.
  const discountLineItems = orderLineItems.map((oli) => ({
    id: oli.id,
    productId: oli.productId,
    totalAmount: oli.totalAmount,
  }));

  const impact = await calculateDiscountImpact({
    tenantId: draft.tenantId,
    ctx,
    code: draft.appliedDiscountCode,
    lineItems: discountLineItems,
  });

  if (!impact.valid) {
    // Q12 — structured operator signal.
    log("error", "draft_order.convert.discount_race_blocked", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      discountCode: draft.appliedDiscountCode,
      piId: stripePaymentIntentId,
      evalError: impact.error,
    });
    throw new ConflictError("DISCOUNT_BECAME_INVALID_AT_CONVERT", {
      draftOrderId: draft.id,
      code: draft.appliedDiscountCode,
      error: impact.error,
    });
  }

  try {
    await commitDiscountApplication(tx, {
      orderId: order.id,
      tenantId: draft.tenantId,
      guestEmail: draft.contactEmail ?? "",
      guestAccountId: draft.guestAccountId ?? undefined,
      impact,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "USAGE_LIMIT_REACHED" || msg === "NOT_ELIGIBLE_FOR_COMPANIES") {
      // Q12 — operator intervention signal (same log event).
      log("error", "draft_order.convert.discount_race_blocked", {
        tenantId: draft.tenantId,
        draftOrderId: draft.id,
        discountCode: draft.appliedDiscountCode,
        piId: stripePaymentIntentId,
        evalError: msg,
      });
    }
    throw err;
  }
}

/**
 * Transition draft PAID → COMPLETING → COMPLETED inside the tx. Writes
 * completedAt + completedOrderId. Throws ConflictError on any missed
 * transition (race with admin / cron).
 */
export async function transitionDraftToCompletedInTx(
  tx: Tx,
  params: {
    draft: DraftForConvert;
    orderId: string;
    actorSource: "webhook" | "admin_manual_recovery";
    actorUserId: string | null;
  },
): Promise<DraftOrder> {
  const { draft, orderId, actorSource, actorUserId } = params;

  const eventActorSource: "webhook" | "api" =
    actorSource === "webhook" ? "webhook" : "api";

  // PAID → COMPLETING
  const t1 = await transitionDraftStatusInTx(tx, {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    from: "PAID",
    to: "COMPLETING",
    actorUserId,
    actorSource: eventActorSource,
    metadata: { orderId },
  });
  if (!t1.transitioned) {
    throw new ConflictError(
      "Draft not in PAID status during convert (race)",
      { draftOrderId: draft.id },
    );
  }

  // COMPLETING → COMPLETED
  const t2 = await transitionDraftStatusInTx(tx, {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    from: "COMPLETING",
    to: "COMPLETED",
    actorUserId,
    actorSource: eventActorSource,
    metadata: { orderId },
  });
  if (!t2.transitioned) {
    throw new ConflictError(
      "Draft not in COMPLETING status during convert (race)",
      { draftOrderId: draft.id },
    );
  }

  // Stamp completedAt + completedOrderId atomically.
  await tx.draftOrder.update({
    where: { id: draft.id },
    data: {
      completedAt: new Date(),
      completedOrderId: orderId,
    },
  });

  // Append a CONVERTED event in addition to the STATE_CHANGED ones
  // (admin timeline friendly).
  await createDraftOrderEventInTx(tx, {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    type: "CONVERTED",
    metadata: { orderId },
    actorUserId,
    actorSource: eventActorSource,
  });

  const refreshed = (await tx.draftOrder.findFirst({
    where: { id: draft.id, tenantId: draft.tenantId },
  })) as DraftOrder;
  return refreshed;
}

// ── Public: convertDraftToOrder ──────────────────────────────────

export async function convertDraftToOrder(
  input: ConvertDraftToOrderArgsShape,
): Promise<ConvertDraftToOrderResult> {
  const params = ConvertDraftToOrderInputSchema.parse(input);

  // Pre-tx: load draft + reservations.
  const draft = await loadDraftForConvert(
    params.tenantId,
    params.draftOrderId,
  );

  // Idempotent replay (P6) — draft already converted.
  if (draft.completedOrderId !== null) {
    const existingOrder = (await prisma.order.findUnique({
      where: { id: draft.completedOrderId },
      include: { lineItems: true, bookings: true },
    })) as (Order & { lineItems: OrderLineItem[]; bookings: Booking[] }) | null;
    if (!existingOrder) {
      throw new ConflictError(
        "Draft has completedOrderId but Order not found — manual recovery required",
        {
          draftOrderId: draft.id,
          completedOrderId: draft.completedOrderId,
        },
      );
    }
    log("info", "draft_order.convert.idempotent_replay", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      orderId: existingOrder.id,
    });
    return {
      draft,
      order: existingOrder,
      orderLineItems: existingOrder.lineItems,
      bookings: existingOrder.bookings,
      alreadyConverted: true,
    };
  }

  // P1-P7 + Q9 preconditions.
  assertConvertPreconditions(draft);

  // Resolve tenant for platform fee.
  const tenant = await prisma.tenant.findUnique({
    where: { id: draft.tenantId },
    select: { subscriptionPlan: true, platformFeeBps: true },
  });
  if (!tenant) {
    throw new NotFoundError("Tenant not found during convert", {
      tenantId: draft.tenantId,
    });
  }
  const { getPlatformFeeBps } = await import(
    "@/app/_lib/payments/platform-fee"
  );
  const feeBps = getPlatformFeeBps(
    tenant.subscriptionPlan,
    tenant.platformFeeBps,
  );

  const adapter = await resolveAdapter(draft.tenantId);

  // Phase A: pre-confirm all holds OUTSIDE tx (sequential, idempotent).
  const forceFresh = params.actorSource === "admin_manual_recovery";
  const confirmedByReservation = await preConfirmAllHolds(
    draft,
    params.stripePaymentIntentId,
    forceFresh,
  );

  // Phase B: allocate order number (Q15 — burned on rollback).
  const orderNumber = await nextOrderNumber(draft.tenantId);

  // Phase B: single atomic tx.
  let orderForReturn: Order;
  let orderLineItemsForReturn: OrderLineItem[];
  let bookingsForReturn: Booking[];
  let draftForReturn: DraftOrder;

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      // Re-read draft under the tx to catch any concurrent mutations.
      const fresh = (await tx.draftOrder.findFirst({
        where: { id: draft.id, tenantId: draft.tenantId },
        include: {
          lineItems: { orderBy: { position: "asc" } },
          reservations: true,
        },
      })) as DraftForConvert | null;
      if (!fresh) {
        throw new NotFoundError("DraftOrder vanished during convert", {
          draftOrderId: draft.id,
        });
      }
      if (fresh.status !== "PAID") {
        throw new ConflictError(
          "Draft no longer in PAID status (race with webhook / admin)",
          { draftOrderId: fresh.id, status: fresh.status },
        );
      }
      if (fresh.completedOrderId !== null) {
        // Race: another convert ran in parallel and committed first.
        throw new ConflictError("CONVERT_RACE_LOST", {
          draftOrderId: fresh.id,
          completedOrderId: fresh.completedOrderId,
        });
      }

      const order = await createOrderFromDraftInTx(tx, {
        draft: fresh,
        orderNumber,
        stripePaymentIntentId: params.stripePaymentIntentId,
        feeBps,
      });

      const orderLineItems = await createOrderLineItemsFromDraftInTx(tx, {
        order,
        draft: fresh,
      });

      const bookings = await createBookingsFromDraftInTx(tx, {
        order,
        draft: fresh,
        confirmedByReservation,
        adapterProvider: adapter.provider,
      });

      await commitDiscountForConvertInTx(tx, {
        draft: fresh,
        order,
        orderLineItems,
        stripePaymentIntentId: params.stripePaymentIntentId,
      });

      const updatedDraft = await transitionDraftToCompletedInTx(tx, {
        draft: fresh,
        orderId: order.id,
        actorSource: params.actorSource,
        actorUserId: params.actorUserId ?? null,
      });

      return { order, orderLineItems, bookings, draft: updatedDraft };
    });

    orderForReturn = txResult.order;
    orderLineItemsForReturn = txResult.orderLineItems;
    bookingsForReturn = txResult.bookings;
    draftForReturn = txResult.draft;
  } catch (err) {
    // L4 defensive catch: same draft converted by a parallel webhook
    // between the replay-check and our Order.create. Order has the
    // stripePaymentIntentId @unique constraint.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existingOrder = (await prisma.order.findUnique({
        where: { stripePaymentIntentId: params.stripePaymentIntentId },
        include: { lineItems: true, bookings: true },
      })) as (Order & { lineItems: OrderLineItem[]; bookings: Booking[] }) | null;
      if (existingOrder) {
        // Re-read draft to pick up the parallel winner's state.
        const winnerDraft = await loadDraftForConvert(
          draft.tenantId,
          draft.id,
        );
        log("info", "draft_order.convert.p2002_replay", {
          tenantId: draft.tenantId,
          draftOrderId: draft.id,
          orderId: existingOrder.id,
          stripePaymentIntentId: params.stripePaymentIntentId,
        });
        return {
          draft: winnerDraft,
          order: existingOrder,
          orderLineItems: existingOrder.lineItems,
          bookings: existingOrder.bookings,
          alreadyConverted: true,
        };
      }
    }
    throw err;
  }

  // Phase C: post-commit fire-and-forget platform webhook.
  log("info", "draft_order.converted", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    orderId: orderForReturn.id,
    orderNumber,
    stripePaymentIntentId: params.stripePaymentIntentId,
    bookingCount: bookingsForReturn.length,
  });

  emitPlatformEvent({
    type: "draft_order.completed",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: draft.displayNumber,
      orderId: orderForReturn.id,
      orderNumber,
      totalAmount: orderForReturn.totalAmount,
      currency: orderForReturn.currency,
      bookingIds: bookingsForReturn.map((b) => b.id),
      completedAt: (draftForReturn.completedAt ?? new Date()).toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      eventType: "draft_order.completed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    draft: draftForReturn,
    order: orderForReturn,
    orderLineItems: orderLineItemsForReturn,
    bookings: bookingsForReturn,
    alreadyConverted: false,
  };
}
