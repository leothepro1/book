/**
 * Read-side service for the customer-facing invoice page.
 *
 * Looks up a draft by its `shareLinkToken` and returns a customer-safe
 * DTO — never the raw DraftOrder row, never internal-only fields like
 * `internalNote`, `actorUserId`, or `metafields.stripePaymentIntentId`.
 *
 * Tenant resolution is the caller's responsibility (typically
 * `resolveTenantFromHost()` in the (guest) surface). We require the
 * caller to pass the resolved `hostTenantId`; if it does not match the
 * draft's tenantId we return `null` — a cross-tenant token must be
 * indistinguishable from a not-found token (no information leak across
 * subdomains).
 *
 * Status gate: only INVOICED / OVERDUE / PAID / COMPLETED drafts are
 * exposed. OPEN / PENDING_APPROVAL / APPROVED / REJECTED / CANCELLED
 * → null. The customer should never see a draft that has not yet been
 * invoiced or one that has been pulled.
 *
 * Expiry: when `shareLinkExpiresAt < now` we still return the DTO with
 * `expired: true` so the page can render an "expired" UI rather than
 * a generic 404. Expiry only matters when the draft is still INVOICED
 * or OVERDUE — once PAID/COMPLETED the link is informational and
 * remains accessible.
 */

import type { DraftOrder, DraftLineItem } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";

// ── Public DTOs ─────────────────────────────────────────────────

export type PublicDraftLineItem = {
  id: string;
  position: number;
  lineType: DraftLineItem["lineType"];
  title: string;
  variantTitle: string | null;
  quantity: number;
  /** Smallest currency unit (öre). */
  unitPriceCents: bigint;
  /** Pre-discount, pre-tax line subtotal. */
  subtotalCents: bigint;
  /** Smallest currency unit. Includes line discount + tax. */
  totalCents: bigint;
  /** ISO date strings — accommodation lines only. */
  checkInDate: string | null;
  checkOutDate: string | null;
  nights: number | null;
};

export type PublicPaymentTerms = {
  name: string;
  type: string;
  netDays: number | null;
} | null;

export type PublicDraftDTO = {
  id: string;
  displayNumber: string;
  status: DraftOrder["status"];

  contactEmail: string | null;
  contactPhone: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;

  /** Customer-facing note (operator → buyer). NEVER `internalNote`. */
  customerNote: string | null;

  // Money — bigint serialisation is the caller's job (server component
  // converts to string before passing to the client component).
  subtotalCents: bigint;
  orderDiscountCents: bigint;
  totalTaxCents: bigint;
  totalCents: bigint;
  currency: string;
  taxesIncluded: boolean;

  appliedDiscountCode: string | null;
  appliedDiscountAmount: bigint | null;

  paymentTerms: PublicPaymentTerms;

  invoiceSentAt: Date | null;
  shareLinkExpiresAt: Date | null;
  invoiceEmailSubject: string | null;
  invoiceEmailMessage: string | null;

  lineItems: PublicDraftLineItem[];
};

export type GetDraftByShareTokenResult =
  | {
      draft: PublicDraftDTO;
      /** True when shareLinkExpiresAt has elapsed and status is still
       *  INVOICED/OVERDUE. PAID/COMPLETED never count as expired. */
      expired: boolean;
    }
  | null;

// ── Status gate ─────────────────────────────────────────────────

const PUBLIC_STATUSES = new Set<DraftOrder["status"]>([
  "INVOICED",
  "OVERDUE",
  "PAID",
  "COMPLETED",
]);

// ── Service ─────────────────────────────────────────────────────

export async function getDraftByShareToken(
  shareLinkToken: string,
  hostTenantId: string,
  options: { now?: Date } = {},
): Promise<GetDraftByShareTokenResult> {
  if (typeof shareLinkToken !== "string" || shareLinkToken.length === 0) {
    return null;
  }
  if (typeof hostTenantId !== "string" || hostTenantId.length === 0) {
    return null;
  }

  const draft = (await prisma.draftOrder.findUnique({
    where: { shareLinkToken },
    include: {
      lineItems: { orderBy: { position: "asc" } },
    },
  })) as
    | (DraftOrder & { lineItems: DraftLineItem[] })
    | null;

  if (!draft) return null;

  // Cross-tenant guard — same response shape as not-found.
  if (draft.tenantId !== hostTenantId) return null;

  // Status gate — pre-INVOICED or terminal-rejected drafts are invisible.
  if (!PUBLIC_STATUSES.has(draft.status)) return null;

  const now = options.now ?? new Date();
  const expired =
    (draft.status === "INVOICED" || draft.status === "OVERDUE") &&
    draft.shareLinkExpiresAt !== null &&
    draft.shareLinkExpiresAt.getTime() < now.getTime();

  return {
    draft: toPublicDTO(draft),
    expired,
  };
}

// ── DTO mapper ──────────────────────────────────────────────────

function toPublicDTO(
  draft: DraftOrder & { lineItems: DraftLineItem[] },
): PublicDraftDTO {
  return {
    id: draft.id,
    displayNumber: draft.displayNumber,
    status: draft.status,

    contactEmail: draft.contactEmail,
    contactPhone: draft.contactPhone,
    contactFirstName: draft.contactFirstName,
    contactLastName: draft.contactLastName,

    customerNote: draft.customerNote,

    subtotalCents: draft.subtotalCents,
    orderDiscountCents: draft.orderDiscountCents,
    totalTaxCents: draft.totalTaxCents,
    totalCents: draft.totalCents,
    currency: draft.currency,
    taxesIncluded: draft.taxesIncluded,

    appliedDiscountCode: draft.appliedDiscountCode,
    appliedDiscountAmount: draft.appliedDiscountAmount,

    paymentTerms: parsePaymentTerms(draft.paymentTermsFrozen),

    invoiceSentAt: draft.invoiceSentAt,
    shareLinkExpiresAt: draft.shareLinkExpiresAt,
    invoiceEmailSubject: draft.invoiceEmailSubject,
    invoiceEmailMessage: draft.invoiceEmailMessage,

    lineItems: draft.lineItems.map(toPublicLineItem),
  };
}

function toPublicLineItem(line: DraftLineItem): PublicDraftLineItem {
  return {
    id: line.id,
    position: line.position,
    lineType: line.lineType,
    title: line.title,
    variantTitle: line.variantTitle ?? null,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    subtotalCents: line.subtotalCents,
    totalCents: line.totalCents,
    checkInDate:
      line.checkInDate !== null ? line.checkInDate.toISOString() : null,
    checkOutDate:
      line.checkOutDate !== null ? line.checkOutDate.toISOString() : null,
    nights: line.nights ?? null,
  };
}

function parsePaymentTerms(
  frozen: DraftOrder["paymentTermsFrozen"],
): PublicPaymentTerms {
  if (frozen === null || frozen === undefined) return null;
  if (typeof frozen !== "object" || Array.isArray(frozen)) return null;
  const obj = frozen as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name : null;
  const type = typeof obj.type === "string" ? obj.type : null;
  if (name === null || type === null) return null;
  const netDays =
    typeof obj.netDays === "number" && Number.isFinite(obj.netDays)
      ? obj.netDays
      : null;
  return { name, type, netDays };
}
