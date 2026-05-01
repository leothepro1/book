/**
 * Phase F — `/invoice/[token]` paid-receipt fork.
 *
 * Rendered when the draft has converted to PAID/COMPLETING/
 * COMPLETED and the linked `Order` row exists. Mirrors the layout
 * of `app/(guest)/order-status/[token]/page.tsx` but uses the
 * tenant theme tokens rather than hardcoded greys, and lives in
 * the `/invoice/[token]` URL space so the buyer doesn't bounce
 * domains.
 *
 * Read-only render — no state-changing calls. Invariant 10.
 */

import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatOrderNumberForTenant } from "@/app/_lib/orders/format-server";

import {
  buildPageStyles,
  type TenantForStatusPage,
} from "./_shared";

export interface OrderForReceipt {
  id: string;
  tenantId: string;
  orderNumber: number;
  status: string;
  currency: string;
  totalAmount: number;
  guestEmail: string;
  createdAt: Date;
  lineItems: Array<{
    title: string;
    variantTitle: string | null;
    quantity: number;
    totalAmount: number;
  }>;
}

export async function PaidReceipt({
  order,
  tenant,
}: {
  order: OrderForReceipt;
  tenant: TenantForStatusPage;
}) {
  const pageStyles = await buildPageStyles(tenant.id);
  const formattedOrderNumber = await formatOrderNumberForTenant(
    order.tenantId,
    order.orderNumber,
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--page-bg)",
        padding: "clamp(2rem, 5vw, 4rem) 1.5rem",
        fontFamily:
          '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        ...pageStyles,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          color: "var(--text)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)",
              fontWeight: 600,
              margin: "0 0 0.5rem",
            }}
            data-i18n="invoice.paid.title"
          >
            Tack! Din bokning är bekräftad
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              margin: 0,
            }}
            data-i18n="invoice.paid.order_number_lead"
          >
            Order {formattedOrderNumber}
          </p>
        </div>

        <div
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: "1.5rem",
          }}
        >
          {order.lineItems.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "0.875rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "1rem",
                fontSize: "0.9375rem",
              }}
            >
              <span>
                {item.title}
                {item.variantTitle && (
                  <span style={{ color: "var(--text-secondary)" }}>
                    {" "}· {item.variantTitle}
                  </span>
                )}
                {item.quantity > 1 && (
                  <span style={{ color: "var(--text-secondary)" }}>
                    {" "}× {item.quantity}
                  </span>
                )}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>
                {formatPriceDisplay(item.totalAmount, order.currency)} kr
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "1rem 1.25rem",
              fontWeight: 600,
              fontSize: "0.9375rem",
            }}
          >
            <span data-i18n="invoice.paid.total">Totalt</span>
            <span>
              {formatPriceDisplay(order.totalAmount, order.currency)} kr
            </span>
          </div>
        </div>

        {order.guestEmail && order.guestEmail.length > 0 && (
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              textAlign: "center",
              margin: "0 0 0.5rem",
            }}
            data-i18n="invoice.paid.confirmation_sent"
          >
            Bekräftelse skickad till {order.guestEmail}
          </p>
        )}
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            textAlign: "center",
            margin: 0,
          }}
        >
          {order.createdAt.toLocaleDateString("sv-SE")}
        </p>
      </div>
    </div>
  );
}
