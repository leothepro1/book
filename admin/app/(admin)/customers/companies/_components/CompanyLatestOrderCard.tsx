"use client";

/**
 * CompanyLatestOrderCard — speglar "Senaste bokning"-kortet på kundsidan
 * bit för bit. Samma CSS (.ord-products-container, .ord-container-badge-row,
 * .ord-product-card, .ord-product-header, .ord-product-details etc.), samma
 * layout, samma expand/collapse-beteende. Enda skillnaden: data hämtas
 * via företagets companyId istället för guestAccountId.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderFulfillmentStatus } from "@prisma/client";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { OrderBadge } from "@/app/(admin)/_components/orders/OrderBadge";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

export interface LatestOrder {
  id: string;
  orderNumber: number;
  fulfillmentStatus: OrderFulfillmentStatus;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  metadata: Record<string, unknown> | null;
  lineItems: {
    id: string;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
  }[];
}

export function CompanyLatestOrderCard({
  latestOrder,
}: {
  latestOrder: LatestOrder | null;
}) {
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  if (!latestOrder) {
    return (
      <div style={CARD}>
        <div style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
          Inga bokningar
        </div>
      </div>
    );
  }

  const o = latestOrder;
  const ful = o.fulfillmentStatus;
  const meta = o.metadata;

  return (
    <div style={CARD} className="ord-products-container">
      <div className="pf-card-header" style={{ marginBottom: 4 }}>
        <span className="pf-card-title">Senaste bokning</span>
        <button
          type="button"
          className="ord-note-edit"
          onClick={() => router.push(`/orders/${o.id}`)}
          aria-label="Visa order"
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--admin-accent)",
            }}
          >
            #{o.orderNumber}
          </span>
        </button>
      </div>
      <div className="ord-container-badge-row">
        <OrderBadge type="fulfillment" fulfillment={ful} />
        {o.fulfilledAt && (
          <span className="ord-container-badge-date">
            Levererad {formatShortDate(o.fulfilledAt)}
          </span>
        )}
        {o.cancelledAt && !o.fulfilledAt && (
          <span className="ord-container-badge-date">
            Avbokad {formatShortDate(o.cancelledAt)}
          </span>
        )}
      </div>
      {o.lineItems.map((item, itemIndex) => {
        const isAccommodation = itemIndex === 0;
        const checkIn = meta?.checkIn as string | undefined;
        const checkOut = meta?.checkOut as string | undefined;
        const guests = meta?.guests as number | undefined;
        const nights = meta?.nights as number | undefined;
        const ratePlanName = isAccommodation
          ? ((meta?.ratePlanName as string) ?? item.variantTitle)
          : item.variantTitle;
        const isExpanded = expandedItems.has(item.id);

        const details: { label: string; value: string }[] = [];
        if (isAccommodation) {
          if (checkIn && checkOut) {
            details.push({
              label: "Datum",
              value: `${new Date(checkIn).toLocaleDateString("sv-SE", {
                day: "numeric",
                month: "short",
              })} – ${new Date(checkOut).toLocaleDateString("sv-SE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`,
            });
          }
          if (nights != null)
            details.push({ label: "Nätter", value: String(nights) });
          if (guests != null)
            details.push({ label: "Gäster", value: String(guests) });
        }
        details.push({ label: "Antal", value: String(item.quantity) });
        if (item.sku) details.push({ label: "SKU", value: item.sku });

        return (
          <div key={item.id} className="ord-product-card">
            <div className="ord-product-header">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="ord-product-header__img"
                />
              ) : (
                <div className="ord-product-header__img ord-product-header__img--empty">
                  <EditorIcon name="image" size={24} />
                </div>
              )}
              <div className="ord-product-header__info">
                <div className="ord-product-header__title">{item.title}</div>
                {ratePlanName && (
                  <div className="ord-product-header__plan">{ratePlanName}</div>
                )}
              </div>
            </div>

            <div className="ord-product-details">
              <button
                type="button"
                className="ord-product-details-toggle"
                onClick={() =>
                  setExpandedItems((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) {
                      next.delete(item.id);
                    } else {
                      next.add(item.id);
                    }
                    return next;
                  })
                }
              >
                <span className="ord-product-details-toggle__summary">
                  {isExpanded
                    ? `${details[0].label}: ${details[0].value}`
                    : details.map((d) => `${d.label}: ${d.value}`).join(" • ")}
                </span>
                <EditorIcon
                  name="expand_more"
                  size={18}
                  className={`ord-product-details-toggle__chevron${isExpanded ? " ord-product-details-toggle__chevron--open" : ""}`}
                />
              </button>
              <div
                className={`ord-product-details__expandable${isExpanded ? " ord-product-details__expandable--open" : ""}`}
              >
                <div className="ord-product-details__expandable-inner">
                  {details.slice(1).map((d) => (
                    <div key={d.label} className="ord-product-details__row">
                      {d.label}:{" "}
                      <span
                        className={`ord-product-details__value${d.label === "SKU" ? " ord-product-details__value--mono" : ""}`}
                      >
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 4,
        }}
      >
        <button
          type="button"
          style={{
            fontSize: 13,
            padding: "5px 12px",
            border: "1px solid var(--admin-border)",
            borderRadius: 8,
            background: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
            color: "var(--admin-text)",
          }}
        >
          Visa alla bokningar
        </button>
      </div>
    </div>
  );
}
