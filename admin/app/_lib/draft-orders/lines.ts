/**
 * DraftOrder — Line-item services.
 *
 * Three entry points (addLineItem in 6.5A; update/remove in 6.5B):
 *   - addLineItem     — snapshot a priced line; create DraftReservation
 *                       (NOT_PLACED) for ACCOMMODATION.
 *   - updateLineItem  — patch existing line; re-price when the patch
 *                       touches pricing axes.
 *   - removeLineItem  — delete line + companion DraftReservation.
 *
 * Transaction discipline:
 *   1. Pre-tx: parse input, fetch draft, validate mutability.
 *   2. Pre-tx: call line-pricing helpers (PMS adapter / B2B resolver /
 *      Product lookup). NEVER inside a $transaction — PMS latency can
 *      exceed the 30s Prisma tx timeout.
 *   3. Tx:   re-validate draft mutability, compute `position`, insert
 *      DraftLineItem + (optional) DraftReservation, emit LINE_ADDED
 *      event, recompute+persist totals atomically.
 *   4. Post-commit: fire-and-forget platform webhook.
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import {
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import {
  computeAccommodationLinePrice,
  computeProductLinePrice,
} from "@/app/_lib/pricing/line-pricing";
import { computeAndPersistDraftTotalsInTx } from "./calculator";
import { createDraftOrderEventInTx } from "./events";
import {
  AddLineItemInputSchema,
  UpdateLineItemInputSchema,
  RemoveLineItemInputSchema,
  type AddLineItemInput,
  type AddLineItemResult,
  type UpdateLineItemInput,
  type UpdateLineItemResult,
  type RemoveLineItemResult,
  type DraftOrder,
  type DraftLineItem,
  type DraftReservation,
} from "./types";

type AddLineItemArgs = z.input<typeof AddLineItemInputSchema>;
type UpdateLineItemArgs = z.input<typeof UpdateLineItemInputSchema>;
type RemoveLineItemArgs = z.input<typeof RemoveLineItemInputSchema>;

// ── Common pre-tx helpers ────────────────────────────────────

async function fetchDraftForMutation(
  tenantId: string,
  draftOrderId: string,
): Promise<DraftOrder> {
  const draft = await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
  });
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  assertDraftMutable(draft);
  return draft;
}

function assertDraftMutable(draft: DraftOrder): void {
  if (draft.status !== "OPEN") {
    throw new ValidationError("Draft is not editable (wrong status)", {
      draftOrderId: draft.id,
      status: draft.status,
    });
  }
  if (draft.pricesFrozenAt !== null) {
    throw new ValidationError("Draft prices are frozen; cannot modify lines", {
      draftOrderId: draft.id,
      pricesFrozenAt: draft.pricesFrozenAt?.toISOString(),
    });
  }
  if (draft.cancelledAt !== null) {
    throw new ValidationError("Draft is cancelled", {
      draftOrderId: draft.id,
    });
  }
  if (draft.completedAt !== null) {
    throw new ValidationError("Draft is completed", {
      draftOrderId: draft.id,
    });
  }
}

function buyerContextFromDraft(
  draft: DraftOrder,
):
  | { kind: "guest"; guestAccountId?: string | null }
  | { kind: "company"; companyLocationId: string; companyContactId?: string }
  | { kind: "walk_in" } {
  if (draft.buyerKind === "COMPANY" && draft.companyLocationId) {
    return {
      kind: "company",
      companyLocationId: draft.companyLocationId,
      ...(draft.companyContactId
        ? { companyContactId: draft.companyContactId }
        : {}),
    };
  }
  if (draft.buyerKind === "WALK_IN") return { kind: "walk_in" };
  return { kind: "guest", guestAccountId: draft.guestAccountId };
}

// ── addLineItem ──────────────────────────────────────────────

type ResolvedAcc = {
  kind: "ACCOMMODATION";
  unitPriceCents: bigint;
  subtotalCents: bigint;
  currency: string;
  nights: number;
  title: string;
  ratePlanId: string;
  ratePlanName: string;
  ratePlanCancellationPolicy: string | null;
  appliedCatalogId: null;
  appliedRule: "LIVE_PMS";
};
type ResolvedProduct = {
  kind: "PRODUCT";
  unitPriceCents: bigint;
  subtotalCents: bigint;
  currency: string;
  title: string;
  productId: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  appliedCatalogId: string | null;
  appliedRule: "BASE" | "FIXED" | "VOLUME" | "ADJUSTMENT";
};
type ResolvedCustom = {
  kind: "CUSTOM";
  unitPriceCents: bigint;
  subtotalCents: bigint;
  currency: string;
  title: string;
  appliedCatalogId: null;
  appliedRule: "CUSTOM";
};
type ResolvedLine = ResolvedAcc | ResolvedProduct | ResolvedCustom;

/**
 * Resolve a line input to its fully-priced snapshot shape. Runs BEFORE
 * the $transaction — PMS/B2B calls must not hold an open tx.
 */
async function resolveLineForAdd(
  draft: DraftOrder,
  line: AddLineItemInput["line"],
): Promise<ResolvedLine> {
  const tenantId = draft.tenantId;

  if (line.lineType === "ACCOMMODATION") {
    const [priced, acc] = await Promise.all([
      computeAccommodationLinePrice({
        tenantId,
        accommodationId: line.accommodationId,
        checkInDate: line.checkInDate,
        checkOutDate: line.checkOutDate,
        guestCounts: line.guestCounts,
        ratePlanId: line.ratePlanId,
        currency: draft.currency,
      }),
      prisma.accommodation.findFirst({
        where: { id: line.accommodationId, tenantId },
        select: { name: true },
      }),
    ]);
    if (!acc) {
      throw new NotFoundError("Accommodation not found in tenant", {
        tenantId,
        accommodationId: line.accommodationId,
      });
    }
    return {
      kind: "ACCOMMODATION",
      unitPriceCents: priced.unitPriceCents,
      subtotalCents: priced.subtotalCents,
      currency: priced.currency,
      nights: priced.nights,
      title: acc.name,
      ratePlanId: priced.ratePlan.id,
      ratePlanName: priced.ratePlan.name,
      ratePlanCancellationPolicy: priced.ratePlan.cancellationPolicy,
      appliedCatalogId: null,
      appliedRule: "LIVE_PMS",
    };
  }

  if (line.lineType === "PRODUCT") {
    const [priced, variant] = await Promise.all([
      computeProductLinePrice({
        tenantId,
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        buyerContext: buyerContextFromDraft(draft),
      }),
      prisma.productVariant.findFirst({
        where: {
          id: line.productVariantId,
          product: { tenantId },
        },
        select: {
          option1: true,
          option2: true,
          option3: true,
          sku: true,
          imageUrl: true,
          productId: true,
          product: { select: { title: true } },
        },
      }),
    ]);
    if (!variant) {
      throw new NotFoundError("ProductVariant not found in tenant", {
        tenantId,
        productVariantId: line.productVariantId,
      });
    }
    const variantTitleParts = [
      variant.option1,
      variant.option2,
      variant.option3,
    ].filter((x): x is string => Boolean(x));
    const variantTitle =
      variantTitleParts.length > 0 ? variantTitleParts.join(" / ") : null;
    return {
      kind: "PRODUCT",
      unitPriceCents: priced.unitPriceCents,
      subtotalCents: priced.subtotalCents,
      currency: priced.currency,
      title: variant.product.title,
      productId: variant.productId,
      variantTitle,
      sku: variant.sku,
      imageUrl: variant.imageUrl,
      appliedCatalogId: priced.appliedCatalogId,
      appliedRule: priced.sourceRule,
    };
  }

  // CUSTOM — no external helper; use input verbatim.
  return {
    kind: "CUSTOM",
    unitPriceCents: line.unitPriceCents,
    subtotalCents: line.unitPriceCents * BigInt(line.quantity),
    currency: draft.currency,
    title: line.title,
    appliedCatalogId: null,
    appliedRule: "CUSTOM",
  };
}

/**
 * Build the `data` for `tx.draftLineItem.create`. Pure — composes the
 * resolved pricing shape with the input's lineType-specific metadata +
 * shared fields (taxable, line-discount shape).
 */
function buildLineItemCreateData(
  draft: DraftOrder,
  resolved: ResolvedLine,
  line: AddLineItemInput["line"],
  position: number,
) {
  // ACC lines are implicitly quantity=1 (partial-unique invariant on
  // (draftOrderId, accommodationId, checkInDate, checkOutDate)); PRODUCT
  // and CUSTOM carry explicit quantity in their input schemas.
  const quantity = line.lineType === "ACCOMMODATION" ? 1 : line.quantity;

  const shared = {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    lineType: resolved.kind,
    position,
    title: resolved.title,
    taxable: line.taxable,
    taxCode: line.taxCode ?? null,
    quantity,
    unitPriceCents: resolved.unitPriceCents,
    subtotalCents: resolved.subtotalCents,
    lineDiscountCents: line.lineDiscountCents ?? BigInt(0),
    taxAmountCents: BigInt(0), // calculator overwrites
    totalCents: resolved.subtotalCents, // calculator overwrites
    appliedCatalogId: resolved.appliedCatalogId,
    appliedRule: resolved.appliedRule,
    lineDiscountTitle: line.lineDiscountTitle ?? null,
    lineDiscountType: line.lineDiscountType ?? null,
    lineDiscountValue: line.lineDiscountValue ?? null,
  };

  if (resolved.kind === "ACCOMMODATION") {
    return {
      ...shared,
      accommodationId: (line as Extract<typeof line, { lineType: "ACCOMMODATION" }>)
        .accommodationId,
      checkInDate: new Date(
        (line as Extract<typeof line, { lineType: "ACCOMMODATION" }>).checkInDate,
      ),
      checkOutDate: new Date(
        (line as Extract<typeof line, { lineType: "ACCOMMODATION" }>).checkOutDate,
      ),
      nights: resolved.nights,
      guestCounts: (line as Extract<
        typeof line,
        { lineType: "ACCOMMODATION" }
      >).guestCounts as unknown as Prisma.InputJsonValue,
      ratePlanId: resolved.ratePlanId,
      ratePlanName: resolved.ratePlanName,
      ratePlanCancellationPolicy: resolved.ratePlanCancellationPolicy,
      selectedAddons:
        (line as Extract<typeof line, { lineType: "ACCOMMODATION" }>)
          .selectedAddons === undefined
          ? Prisma.JsonNull
          : ((line as Extract<typeof line, { lineType: "ACCOMMODATION" }>)
              .selectedAddons as Prisma.InputJsonValue),
    };
  }

  if (resolved.kind === "PRODUCT") {
    return {
      ...shared,
      productId: resolved.productId,
      productVariantId: (line as Extract<typeof line, { lineType: "PRODUCT" }>)
        .productVariantId,
      variantTitle: resolved.variantTitle,
      sku: resolved.sku,
      imageUrl: resolved.imageUrl,
    };
  }

  return { ...shared }; // CUSTOM — only shared fields
}

export async function addLineItem(
  input: AddLineItemArgs,
): Promise<AddLineItemResult> {
  const params = AddLineItemInputSchema.parse(input);

  // 1. Pre-tx: load draft + check mutability (fast-fail before PMS calls).
  const draft = await fetchDraftForMutation(
    params.tenantId,
    params.draftOrderId,
  );

  // 2. Pre-tx: resolve price + external data. PMS adapter runs HERE,
  //    not inside the $transaction.
  const resolved = await resolveLineForAdd(draft, params.line);

  // 3. Pre-tx: currency invariant.
  if (resolved.currency !== draft.currency) {
    throw new ValidationError("Line currency does not match draft currency", {
      draftCurrency: draft.currency,
      lineCurrency: resolved.currency,
    });
  }

  // 4. Tx: persist line + reservation + event + recompute totals.
  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftMutable(fresh);

    const lastLine = await tx.draftLineItem.findFirst({
      where: { draftOrderId: draft.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (lastLine?.position ?? -1) + 1;

    const createData = buildLineItemCreateData(
      fresh,
      resolved,
      params.line,
      position,
    );

    const lineItem = (await tx.draftLineItem.create({
      data: createData,
    })) as DraftLineItem;

    let reservation: DraftReservation | null = null;
    if (resolved.kind === "ACCOMMODATION") {
      const accLine = params.line as Extract<
        typeof params.line,
        { lineType: "ACCOMMODATION" }
      >;
      reservation = (await tx.draftReservation.create({
        data: {
          tenantId: draft.tenantId,
          draftOrderId: draft.id,
          draftLineItemId: lineItem.id,
          accommodationId: accLine.accommodationId,
          ratePlanId: resolved.ratePlanId,
          checkInDate: new Date(accLine.checkInDate),
          checkOutDate: new Date(accLine.checkOutDate),
          guestCounts: accLine.guestCounts as unknown as Prisma.InputJsonValue,
          // holdState defaults to NOT_PLACED (schema default)
        },
      })) as DraftReservation;
    }

    const eventQuantity =
      params.line.lineType === "ACCOMMODATION" ? 1 : params.line.quantity;
    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "LINE_ADDED",
      metadata: {
        lineItemId: lineItem.id,
        lineType: resolved.kind,
        title: resolved.title,
        quantity: eventQuantity,
        unitPriceCents: resolved.unitPriceCents.toString(),
        subtotalCents: resolved.subtotalCents.toString(),
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const totals = await computeAndPersistDraftTotalsInTx(
      tx,
      draft.tenantId,
      draft.id,
    );

    const refreshed = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;

    // Re-read lineItem so it carries calculator-written taxAmountCents/totalCents.
    const refreshedLine = (await tx.draftLineItem.findFirst({
      where: { id: lineItem.id },
    })) as DraftLineItem;

    return {
      draft: refreshed,
      lineItem: refreshedLine,
      reservation,
      totals,
    };
  });

  log("info", "draft_order.line_added", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    lineItemId: result.lineItem.id,
    lineType: resolved.kind,
  });

  // Platform webhook — fire-and-forget.
  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "line_added",
      lineItemId: result.lineItem.id,
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

  return result;
}

// ── updateLineItem ───────────────────────────────────────────

/**
 * Fields whose presence in a patch triggers a full re-price via the
 * FAS 6.2 line-pricing helpers.
 */
const PRICING_TRIGGERS = {
  ACCOMMODATION: new Set([
    "checkInDate",
    "checkOutDate",
    "guestCounts",
    "ratePlanId",
  ]),
  PRODUCT: new Set(["quantity"]),
  CUSTOM: new Set(["quantity", "unitPriceCents"]),
} as const;

function patchTouchesPricing(
  lineType: "ACCOMMODATION" | "PRODUCT" | "CUSTOM",
  patch: UpdateLineItemInput["patch"],
): boolean {
  const triggers = PRICING_TRIGGERS[lineType];
  for (const key of Object.keys(patch)) {
    if (triggers.has(key as never)) return true;
  }
  return false;
}

/** Extract the changed keys between a patch and the stored DraftLineItem. */
function diffPatch(
  patch: UpdateLineItemInput["patch"],
  line: DraftLineItem,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "lineType") continue;
    if (value === undefined) continue;
    // Coarse equality — for dates/bigints the string form is stable enough
    // for audit-log purposes.
    const before = (line as Record<string, unknown>)[key];
    if (String(before) !== String(value)) {
      out[key] = { from: String(before), to: String(value) };
    }
  }
  return out;
}

export async function updateLineItem(
  input: UpdateLineItemArgs,
): Promise<UpdateLineItemResult> {
  const params = UpdateLineItemInputSchema.parse(input);

  // Pre-tx: load draft + line and validate.
  const draft = await fetchDraftForMutation(
    params.tenantId,
    params.draftOrderId,
  );

  const line = (await prisma.draftLineItem.findFirst({
    where: {
      id: params.lineItemId,
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
    },
  })) as DraftLineItem | null;
  if (!line) {
    throw new NotFoundError("DraftLineItem not found in draft", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      lineItemId: params.lineItemId,
    });
  }
  if (line.lineType !== params.patch.lineType) {
    throw new ValidationError("Patch lineType does not match stored line", {
      stored: line.lineType,
      patch: params.patch.lineType,
    });
  }

  // ── FAS 6.5C: hold-aware guard on reservation-relevant ACC patches ──
  // When an ACC line has an active hold at Mews, editing dates/guests/
  // ratePlan would desync our DraftReservation from what Mews has. Per
  // operator Q4: reject. Admin must release hold, edit, then re-place.
  //
  // Metadata-only patches (taxable, taxCode, line discount) are allowed
  // regardless of hold state — they don't affect the PMS reservation.
  if (line.lineType === "ACCOMMODATION") {
    const accPatchKeys = Object.keys(params.patch);
    const touchesReservation = accPatchKeys.some((k) =>
      ["checkInDate", "checkOutDate", "guestCounts", "ratePlanId"].includes(k),
    );
    if (touchesReservation) {
      const reservation = await prisma.draftReservation.findFirst({
        where: { draftLineItemId: line.id, tenantId: params.tenantId },
        select: { holdState: true },
      });
      if (reservation) {
        if (reservation.holdState === "PLACING") {
          throw new ValidationError(
            "Cannot modify line — hold placement is in flight",
            { draftLineItemId: line.id },
          );
        }
        if (reservation.holdState === "PLACED") {
          throw new ValidationError(
            "Cannot modify line — hold is active; release it first",
            {
              draftLineItemId: line.id,
              code: "HOLD_ACTIVE_CANNOT_MODIFY",
            },
          );
        }
        if (reservation.holdState === "CONFIRMED") {
          throw new ValidationError(
            "Cannot modify line — hold is confirmed (draft already converted)",
            { draftLineItemId: line.id },
          );
        }
        // NOT_PLACED / FAILED / RELEASED → fall through; edit allowed.
      }
    }
  }

  // Pre-tx: re-price if the patch touches pricing axes.
  const priceChanged = patchTouchesPricing(line.lineType, params.patch);
  let resolved: ResolvedLine | null = null;
  if (priceChanged) {
    resolved = await resolveLineForUpdate(draft, line, params.patch);
    if (resolved.currency !== draft.currency) {
      throw new ValidationError(
        "Re-priced line currency does not match draft currency",
        { draftCurrency: draft.currency, lineCurrency: resolved.currency },
      );
    }
  }

  // Tx: mutate + recompute totals.
  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftMutable(fresh);

    const updateData = buildLineItemUpdateData(line, params.patch, resolved);
    await tx.draftLineItem.update({
      where: { id: line.id },
      data: updateData,
    });

    // Keep the companion DraftReservation's snapshot in sync for ACC
    // when the patch changed reservation-relevant fields.
    let reservation: DraftReservation | null = null;
    if (line.lineType === "ACCOMMODATION") {
      const accPatch = params.patch as Extract<
        typeof params.patch,
        { lineType: "ACCOMMODATION" }
      >;
      const reservationData: Record<string, unknown> = {};
      if (accPatch.checkInDate !== undefined) {
        reservationData.checkInDate = new Date(accPatch.checkInDate);
      }
      if (accPatch.checkOutDate !== undefined) {
        reservationData.checkOutDate = new Date(accPatch.checkOutDate);
      }
      if (accPatch.guestCounts !== undefined) {
        reservationData.guestCounts =
          accPatch.guestCounts as unknown as Prisma.InputJsonValue;
      }
      if (resolved && resolved.kind === "ACCOMMODATION") {
        reservationData.ratePlanId = resolved.ratePlanId;
      }
      if (Object.keys(reservationData).length > 0) {
        await tx.draftReservation.updateMany({
          where: { draftLineItemId: line.id, tenantId: draft.tenantId },
          data: reservationData,
        });
      }
      reservation = (await tx.draftReservation.findFirst({
        where: { draftLineItemId: line.id, tenantId: draft.tenantId },
      })) as DraftReservation | null;
    }

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "LINE_UPDATED",
      metadata: {
        lineItemId: line.id,
        lineType: line.lineType,
        priceChanged,
        changes: diffPatch(params.patch, line) as Prisma.InputJsonValue,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const totals = await computeAndPersistDraftTotalsInTx(
      tx,
      draft.tenantId,
      draft.id,
    );

    const refreshedDraft = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;
    const refreshedLine = (await tx.draftLineItem.findFirst({
      where: { id: line.id },
    })) as DraftLineItem;

    return {
      draft: refreshedDraft,
      lineItem: refreshedLine,
      reservation,
      totals,
    };
  });

  log("info", "draft_order.line_updated", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    lineItemId: line.id,
    priceChanged,
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "line_updated",
      lineItemId: line.id,
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

  return result;
}

/** Re-price on update — mirrors `resolveLineForAdd` but merges patch + stored. */
async function resolveLineForUpdate(
  draft: DraftOrder,
  line: DraftLineItem,
  patch: UpdateLineItemInput["patch"],
): Promise<ResolvedLine> {
  const tenantId = draft.tenantId;

  if (patch.lineType === "ACCOMMODATION") {
    const effectiveCheckIn =
      patch.checkInDate ??
      (line.checkInDate ? isoDate(line.checkInDate) : null);
    const effectiveCheckOut =
      patch.checkOutDate ??
      (line.checkOutDate ? isoDate(line.checkOutDate) : null);
    const effectiveGuests = patch.guestCounts ?? (line.guestCounts as {
      adults: number;
      children: number;
      infants: number;
    } | null);
    const effectiveRatePlan = patch.ratePlanId ?? line.ratePlanId ?? undefined;

    if (!effectiveCheckIn || !effectiveCheckOut || !effectiveGuests) {
      throw new ValidationError(
        "Accommodation line is missing dates or guest counts",
        { lineItemId: line.id },
      );
    }
    if (new Date(effectiveCheckOut) <= new Date(effectiveCheckIn)) {
      throw new ValidationError("checkOutDate must be after checkInDate", {
        lineItemId: line.id,
      });
    }

    const [priced, acc] = await Promise.all([
      computeAccommodationLinePrice({
        tenantId,
        accommodationId: line.accommodationId as string,
        checkInDate: effectiveCheckIn,
        checkOutDate: effectiveCheckOut,
        guestCounts: effectiveGuests,
        ratePlanId: effectiveRatePlan,
        currency: draft.currency,
      }),
      prisma.accommodation.findFirst({
        where: { id: line.accommodationId as string, tenantId },
        select: { name: true },
      }),
    ]);
    if (!acc) {
      throw new NotFoundError("Accommodation not found in tenant", {
        tenantId,
        accommodationId: line.accommodationId,
      });
    }
    return {
      kind: "ACCOMMODATION",
      unitPriceCents: priced.unitPriceCents,
      subtotalCents: priced.subtotalCents,
      currency: priced.currency,
      nights: priced.nights,
      title: acc.name,
      ratePlanId: priced.ratePlan.id,
      ratePlanName: priced.ratePlan.name,
      ratePlanCancellationPolicy: priced.ratePlan.cancellationPolicy,
      appliedCatalogId: null,
      appliedRule: "LIVE_PMS",
    };
  }

  if (patch.lineType === "PRODUCT") {
    const effectiveQty = patch.quantity ?? line.quantity;
    const priced = await computeProductLinePrice({
      tenantId,
      productVariantId: line.productVariantId as string,
      quantity: effectiveQty,
      buyerContext: buyerContextFromDraft(draft),
    });
    return {
      kind: "PRODUCT",
      unitPriceCents: priced.unitPriceCents,
      subtotalCents: priced.subtotalCents,
      currency: priced.currency,
      title: line.title,
      productId: line.productId as string,
      variantTitle: line.variantTitle,
      sku: line.sku,
      imageUrl: line.imageUrl,
      appliedCatalogId: priced.appliedCatalogId,
      appliedRule: priced.sourceRule,
    };
  }

  // CUSTOM
  const effectiveQty = patch.quantity ?? line.quantity;
  const effectiveUnit = patch.unitPriceCents ?? line.unitPriceCents;
  return {
    kind: "CUSTOM",
    unitPriceCents: effectiveUnit,
    subtotalCents: effectiveUnit * BigInt(effectiveQty),
    currency: draft.currency,
    title: patch.title ?? line.title,
    appliedCatalogId: null,
    appliedRule: "CUSTOM",
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildLineItemUpdateData(
  line: DraftLineItem,
  patch: UpdateLineItemInput["patch"],
  resolved: ResolvedLine | null,
): Prisma.DraftLineItemUpdateInput {
  const data: Prisma.DraftLineItemUpdateInput = {};

  // Repriced pricing snapshot (when triggered)
  if (resolved) {
    data.unitPriceCents = resolved.unitPriceCents;
    data.subtotalCents = resolved.subtotalCents;
    data.appliedCatalogId = resolved.appliedCatalogId;
    data.appliedRule = resolved.appliedRule;

    if (resolved.kind === "ACCOMMODATION") {
      data.nights = resolved.nights;
      data.ratePlanId = resolved.ratePlanId;
      data.ratePlanName = resolved.ratePlanName;
      data.ratePlanCancellationPolicy = resolved.ratePlanCancellationPolicy;
    }
    // PRODUCT title is immutable (product renames don't propagate to drafts).
    if (resolved.kind === "CUSTOM" && patch.lineType === "CUSTOM") {
      if (patch.title !== undefined) data.title = patch.title;
    }
  }

  // Common metadata-only patches
  if (patch.taxable !== undefined) data.taxable = patch.taxable;
  if (patch.taxCode !== undefined) data.taxCode = patch.taxCode;
  if (patch.lineDiscountCents !== undefined) {
    data.lineDiscountCents = patch.lineDiscountCents ?? BigInt(0);
  }
  if (patch.lineDiscountType !== undefined) {
    data.lineDiscountType = patch.lineDiscountType;
  }
  if (patch.lineDiscountValue !== undefined) {
    data.lineDiscountValue = patch.lineDiscountValue;
  }
  if (patch.lineDiscountTitle !== undefined) {
    data.lineDiscountTitle = patch.lineDiscountTitle;
  }

  // Quantity on PRODUCT/CUSTOM (re-priced above uses correct subtotal;
  // still write the quantity column).
  if (patch.lineType === "PRODUCT" || patch.lineType === "CUSTOM") {
    if (patch.quantity !== undefined) data.quantity = patch.quantity;
  }

  // Date columns for ACC (Prisma needs Date objects).
  if (patch.lineType === "ACCOMMODATION") {
    if (patch.checkInDate !== undefined) {
      data.checkInDate = new Date(patch.checkInDate);
    }
    if (patch.checkOutDate !== undefined) {
      data.checkOutDate = new Date(patch.checkOutDate);
    }
    if (patch.guestCounts !== undefined) {
      data.guestCounts = patch.guestCounts as unknown as Prisma.InputJsonValue;
    }
    if (patch.selectedAddons !== undefined) {
      data.selectedAddons =
        patch.selectedAddons === null
          ? Prisma.JsonNull
          : (patch.selectedAddons as Prisma.InputJsonValue);
    }
  }

  // CUSTOM may update title without repricing (avoid conflict with the
  // repriced branch above — handled only if `resolved` is null).
  if (!resolved && patch.lineType === "CUSTOM" && patch.title !== undefined) {
    data.title = patch.title;
  }

  // Suppress unused-variable warning.
  void line;

  return data;
}

// ── removeLineItem ───────────────────────────────────────────

export async function removeLineItem(
  input: RemoveLineItemArgs,
): Promise<RemoveLineItemResult> {
  const params = RemoveLineItemInputSchema.parse(input);

  const draft = await fetchDraftForMutation(
    params.tenantId,
    params.draftOrderId,
  );

  const line = (await prisma.draftLineItem.findFirst({
    where: {
      id: params.lineItemId,
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
    },
  })) as DraftLineItem | null;
  if (!line) {
    throw new NotFoundError("DraftLineItem not found in draft", {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      lineItemId: params.lineItemId,
    });
  }

  // ── FAS 6.5C: hold-aware pre-tx branch ──
  // ACCOMMODATION lines may have an active DraftReservation. The hold
  // state determines the pre-delete action:
  //   NOT_PLACED / FAILED / RELEASED → safe to delete (no adapter call)
  //   PLACED                         → release first, THEN delete
  //   PLACING                        → reject (HOLD_IN_FLIGHT)
  //   CONFIRMED                      → reject (hold belongs to an Order)
  if (line.lineType === "ACCOMMODATION") {
    const reservation = await prisma.draftReservation.findFirst({
      where: { draftLineItemId: line.id, tenantId: draft.tenantId },
      select: { holdState: true },
    });
    if (reservation) {
      if (reservation.holdState === "PLACING") {
        throw new ValidationError(
          "Cannot remove line — hold placement is in flight",
          { draftLineItemId: line.id },
        );
      }
      if (reservation.holdState === "CONFIRMED") {
        throw new ValidationError(
          "Cannot remove line — hold is confirmed (draft already converted)",
          { draftLineItemId: line.id },
        );
      }
      if (reservation.holdState === "PLACED") {
        // Release the hold BEFORE the removal tx. Async call cannot be
        // inside our $transaction (Mews network latency must not hold
        // it open). Release service manages its own tx + events.
        const { releaseHoldForDraftLine } = await import("./holds");
        await releaseHoldForDraftLine({
          tenantId: draft.tenantId,
          draftLineItemId: line.id,
          source: "line_removed",
          actorUserId: params.actorUserId,
        });
      }
      // NOT_PLACED / FAILED / RELEASED → no-op; fall through to delete.
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    assertDraftMutable(fresh);

    // DraftReservation → DraftLineItem has no FK cascade; delete manually.
    // Hold already released above (if was PLACED); safe to delete the row.
    if (line.lineType === "ACCOMMODATION") {
      await tx.draftReservation.deleteMany({
        where: { draftLineItemId: line.id, tenantId: draft.tenantId },
      });
    }

    await tx.draftLineItem.delete({ where: { id: line.id } });

    // No position reordering — gaps are acceptable (Shopify convention).

    await createDraftOrderEventInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      type: "LINE_REMOVED",
      metadata: {
        lineItemId: line.id,
        lineType: line.lineType,
        title: line.title,
      },
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
    });

    const totals = await computeAndPersistDraftTotalsInTx(
      tx,
      draft.tenantId,
      draft.id,
    );

    const refreshedDraft = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
    })) as DraftOrder;

    return { draft: refreshedDraft, totals };
  });

  log("info", "draft_order.line_removed", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    lineItemId: line.id,
    lineType: line.lineType,
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: draft.tenantId,
    payload: {
      draftOrderId: draft.id,
      tenantId: draft.tenantId,
      displayNumber: result.draft.displayNumber,
      changeType: "line_removed",
      lineItemId: line.id,
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

  return result;
}
