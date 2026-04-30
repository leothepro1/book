/**
 * Phase F — `/invoice/[token]` server-component route.
 *
 * Implements `draft-orders-invoice-flow.md` v1.3 §7.1 + §7.2.
 *
 * Two-stage classification:
 *
 *   1. `classifyTokenState(draft, now)` (pure) maps token → one of
 *      6 forks: not_found / cancelled / paid / expired / fresh /
 *      resume.
 *   2. fresh + resume forks delegate to Phase E's
 *      `createDraftCheckoutSession`, which itself returns a 6-kind
 *      union (created / resumed / unit_unavailable /
 *      stripe_unavailable / tenant_not_ready / draft_not_payable).
 *
 * The route is read-only on every fork EXCEPT fresh and resume —
 * those go through the lazy-creation pipeline that writes the
 * session row + PMS hold + Stripe PI. Invariant 10 holds because
 * the read-only forks (paid, expired, cancelled, not_found) make
 * no state-changing calls.
 *
 * Phase F does NOT wire `/checkout?draftSession=` (Phase G) or the
 * polling endpoint (Phase G). The redirect target on
 * created/resumed will 404 until Phase G lands — this is intentional
 * per the roadmap split. End-to-end buyer flow ships with Phase G.
 */

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import {
  resolveDraftByToken,
  classifyTokenState,
} from "@/app/_lib/draft-orders/resolve-token";
import { createDraftCheckoutSession } from "@/app/_lib/draft-orders/checkout-session";

import { CancelledPage } from "../_components/CancelledPage";
import { ExpiredPage } from "../_components/ExpiredPage";
import {
  PaidReceipt,
  type OrderForReceipt,
} from "../_components/PaidReceipt";
import { PaymentUnavailablePage } from "../_components/PaymentUnavailablePage";
import { UnitUnavailablePage } from "../_components/UnitUnavailablePage";
import type { TenantForStatusPage } from "../_components/_shared";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const tenantRow = await resolveTenantFromHost();
  if (!tenantRow) return notFound();

  const tenant: TenantForStatusPage = {
    id: tenantRow.id,
    name: tenantRow.name,
    phone: tenantRow.phone,
    emailFrom: tenantRow.emailFrom,
    portalSlug: tenantRow.portalSlug,
  };

  const draft = await resolveDraftByToken(token, tenant.id);
  const tokenState = classifyTokenState(draft, new Date());

  log("info", "draft_invoice.token_resolved", {
    tenantId: tenant.id,
    draftId: draft?.id ?? null,
    kind: tokenState.kind,
  });

  switch (tokenState.kind) {
    case "not_found": {
      // Three distinct upstream causes share the not_found render.
      // Tag the subkind so Phase K can graph them separately
      // (token-typo vs invariant-broken vs late-stale-token).
      log("info", "draft_invoice.token_404", {
        tenantId: tenant.id,
        tokenPrefix: token.slice(0, 8),
        subkind:
          draft === null
            ? "token_unresolved"
            : draft.status === "PAID" ||
                draft.status === "COMPLETING" ||
                draft.status === "COMPLETED"
              ? "paid_without_order"
              : "draft_not_invoiced",
      });
      return notFound();
    }

    case "expired":
      return <ExpiredPage tenant={tenant} />;

    case "cancelled":
      return <CancelledPage tenant={tenant} />;

    case "paid": {
      const order = await loadOrderForReceipt(
        tokenState.orderId,
        tenant.id,
      );
      if (!order) {
        // Belt-and-braces: the classifier already tenant-scoped the
        // draft load, so `completedOrderId` is implicitly
        // tenant-scoped. If the order load returns null with a
        // non-null orderId, treat as a data-integrity issue, log
        // error, and 404 rather than render a half-broken receipt.
        log("error", "draft_invoice.paid_order_load_failed", {
          tenantId: tenant.id,
          draftId: tokenState.draft.id,
          orderId: tokenState.orderId,
        });
        return notFound();
      }
      return <PaidReceipt order={order} tenant={tenant} />;
    }

    case "resume":
    case "fresh": {
      const result = await createDraftCheckoutSession(
        tenant.id,
        tokenState.draft.id,
      );
      log("info", "draft_invoice.fresh_checkout_kind", {
        tenantId: tenant.id,
        draftId: tokenState.draft.id,
        kind: result.kind,
      });
      switch (result.kind) {
        case "created":
        case "resumed":
          redirect(result.redirectUrl);
        case "unit_unavailable":
          return <UnitUnavailablePage tenant={tenant} />;
        case "stripe_unavailable":
        case "tenant_not_ready":
          return (
            <PaymentUnavailablePage tenant={tenant} reason={result.kind} />
          );
        case "draft_not_payable":
          // Theoretically unreachable — `classifyTokenState`
          // filters status/expiry/active-session-shape before we
          // ever delegate to Phase E. Reaching here means the
          // helper found a structural failure the classifier
          // missed (e.g. missing buyer email, totals=0). Log loud
          // — the framework Sentry hook captures the
          // breadcrumb — then render the same surface as
          // stripe_unavailable so the buyer gets coherent UX.
          log("error", "draft_invoice.unexpected_draft_not_payable", {
            tenantId: tenant.id,
            draftId: tokenState.draft.id,
            reason: result.reason,
          });
          return (
            <PaymentUnavailablePage tenant={tenant} reason={result.kind} />
          );
      }
    }
  }
}

async function loadOrderForReceipt(
  orderId: string,
  tenantId: string,
): Promise<OrderForReceipt | null> {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      status: true,
      currency: true,
      totalAmount: true,
      guestEmail: true,
      createdAt: true,
      lineItems: {
        select: {
          title: true,
          variantTitle: true,
          quantity: true,
          totalAmount: true,
        },
      },
    },
  });
}
