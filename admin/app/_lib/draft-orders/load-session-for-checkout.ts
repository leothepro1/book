/**
 * Phase G — server-side helper for the buyer checkout pages.
 *
 * Loads a `DraftCheckoutSession` together with the parent
 * `DraftOrder`'s buyer contact snapshot, line items, and
 * `shareLinkToken` / `completedOrderId`. One DB round-trip,
 * tenant-scoped, returns null on cross-tenant access.
 *
 * Two consumers (one shape):
 *   - `app/(guest)/checkout/page.tsx`            (draft branch — Phase G)
 *   - `app/(guest)/checkout/success/page.tsx`   (draft branch — Phase G)
 *
 * The helper does NOT classify status; callers branch on `status` and
 * either render the Elements form, redirect to the success page, or
 * redirect back to `/invoice/{token}` for re-classification by Phase F.
 */

import type { DraftCheckoutSessionStatus } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";

export interface SessionForCheckoutLineItem {
  id: string;
  title: string;
  quantity: number;
  unitPriceCents: bigint;
  totalCents: bigint;
}

export interface SessionForCheckout {
  id: string;
  status: DraftCheckoutSessionStatus;
  /**
   * Phase E persists `stripeClientSecret` atomically with the PI ID
   * in step 5 of the lazy-creation pipeline. For a row with
   * `status === "ACTIVE"` the secret is non-null by construction;
   * the type stays nullable to mirror the schema.
   */
  stripeClientSecret: string | null;
  frozenSubtotal: bigint;
  frozenTaxAmount: bigint;
  frozenDiscountAmount: bigint;
  frozenTotal: bigint;
  currency: string;
  draftOrder: {
    id: string;
    shareLinkToken: string;
    /** Set once the Stripe webhook converts the session to an Order (Phase H). */
    completedOrderId: string | null;
    contactEmail: string | null;
    contactFirstName: string | null;
    contactLastName: string | null;
    lineItems: SessionForCheckoutLineItem[];
  };
}

/**
 * Tenant-scoped load. Cross-tenant access returns `null` so the
 * caller renders 404 — never an unauthorized error message.
 *
 * `shareLinkToken` is `String? @unique` on the schema (nullable). The
 * helper narrows it to `string` in the public shape; callers should
 * only reach this path for invoiced drafts where the token was set at
 * `sendInvoice` time. If the token is null on a session that this
 * helper resolves successfully, the parent draft is in an invariant-
 * violating state — callers should treat the row as missing rather
 * than render against a half-formed draft.
 */
export async function loadSessionForCheckout(
  sessionId: string,
  tenantId: string,
): Promise<SessionForCheckout | null> {
  const row = await prisma.draftCheckoutSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      stripeClientSecret: true,
      frozenSubtotal: true,
      frozenTaxAmount: true,
      frozenDiscountAmount: true,
      frozenTotal: true,
      currency: true,
      draftOrder: {
        select: {
          id: true,
          shareLinkToken: true,
          completedOrderId: true,
          contactEmail: true,
          contactFirstName: true,
          contactLastName: true,
          lineItems: {
            select: {
              id: true,
              title: true,
              quantity: true,
              unitPriceCents: true,
              totalCents: true,
            },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!row || row.tenantId !== tenantId) return null;
  if (!row.draftOrder.shareLinkToken) return null;

  return {
    id: row.id,
    status: row.status,
    stripeClientSecret: row.stripeClientSecret,
    frozenSubtotal: row.frozenSubtotal,
    frozenTaxAmount: row.frozenTaxAmount,
    frozenDiscountAmount: row.frozenDiscountAmount,
    frozenTotal: row.frozenTotal,
    currency: row.currency,
    draftOrder: {
      id: row.draftOrder.id,
      shareLinkToken: row.draftOrder.shareLinkToken,
      completedOrderId: row.draftOrder.completedOrderId,
      contactEmail: row.draftOrder.contactEmail,
      contactFirstName: row.draftOrder.contactFirstName,
      contactLastName: row.draftOrder.contactLastName,
      lineItems: row.draftOrder.lineItems,
    },
  };
}
