"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { getOrder, fulfillOrder, cancelOrder, type OrderDetail } from "../actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "../orders.css";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Väntande",
  PAID: "Betald",
  FULFILLED: "Levererad",
  CANCELLED: "Avbokad",
  REFUNDED: "Återbetald",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "ord__badge--pending",
  PAID: "ord__badge--paid",
  FULFILLED: "ord__badge--fulfilled",
  CANCELLED: "ord__badge--cancelled",
  REFUNDED: "ord__badge--refunded",
};

const EVENT_ICONS: Record<string, string> = {
  CREATED: "add_circle",
  PAID: "payments",
  FULFILLED: "check_circle",
  CANCELLED: "cancel",
  REFUNDED: "undo",
  INVENTORY_RESERVED: "inventory",
  INVENTORY_CONSUMED: "inventory",
  INVENTORY_RELEASED: "inventory",
  STRIPE_WEBHOOK_RECEIVED: "webhook",
  NOTE_ADDED: "note",
  EMAIL_SENT: "mail",
};

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrder(orderId)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [orderId]);

  const handleFulfill = () => {
    setError(null);
    startTransition(async () => {
      const result = await fulfillOrder(orderId);
      if (!result.ok) {
        setError(result.error);
      } else {
        const updated = await getOrder(orderId);
        setOrder(updated);
      }
    });
  };

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (!result.ok) {
        setError(result.error);
      } else {
        const updated = await getOrder(orderId);
        setOrder(updated);
      }
    });
  };

  if (loading) {
    return <div className="ord" style={{ padding: "var(--space-8)" }}>Laddar...</div>;
  }

  if (!order) {
    return <div className="ord" style={{ padding: "var(--space-8)" }}>Ordern hittades inte.</div>;
  }

  return (
    <div className="ord" style={{ maxWidth: 900 }}>
      {/* Back link */}
      <Link
        href="/orders"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "var(--font-sm)",
          color: "var(--admin-text-secondary)",
          textDecoration: "none",
          marginBottom: "var(--space-4)",
        }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
        Beställningar
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--font-xl)", fontWeight: 600, margin: 0 }}>
          #{order.orderNumber}
        </h1>
        <span className={`ord__badge ${STATUS_CLASSES[order.status] ?? ""}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
        <span style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginLeft: "auto" }}>
          {new Date(order.createdAt).toLocaleString("sv-SE")}
        </span>
      </div>

      {error && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "color-mix(in srgb, var(--admin-danger) 6%, transparent)",
            color: "var(--admin-danger)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-sm)",
            marginBottom: "var(--space-4)",
          }}
        >
          {error}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-6)", alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Line items */}
          <div style={{ border: "1px solid var(--admin-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--admin-surface)", borderBottom: "1px solid var(--admin-border)" }}>
              <h3 style={{ fontSize: "var(--font-sm)", fontWeight: 600, margin: 0 }}>Artiklar</h3>
            </div>
            {order.lineItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-4)",
                  borderBottom: "1px solid var(--admin-border)",
                }}
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", objectFit: "cover" }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--font-sm)", fontWeight: 500 }}>{item.title}</div>
                  {item.variantTitle && (
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>{item.variantTitle}</div>
                  )}
                </div>
                <div style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", whiteSpace: "nowrap" }}>
                  {item.quantity} x {formatPriceDisplay(item.unitAmount, item.currency)} kr
                </div>
                <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, minWidth: 80, textAlign: "right" }}>
                  {formatPriceDisplay(item.totalAmount, item.currency)} kr
                </div>
              </div>
            ))}
            {/* Totals */}
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-sm)", marginBottom: "var(--space-2)" }}>
                <span style={{ color: "var(--admin-text-secondary)" }}>Delsumma</span>
                <span>{formatPriceDisplay(order.subtotalAmount, order.currency)} kr</span>
              </div>
              {order.taxAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-sm)", marginBottom: "var(--space-2)" }}>
                  <span style={{ color: "var(--admin-text-secondary)" }}>Moms</span>
                  <span>{formatPriceDisplay(order.taxAmount, order.currency)} kr</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-sm)", fontWeight: 600, paddingTop: "var(--space-2)", borderTop: "1px solid var(--admin-border)" }}>
                <span>Totalt</span>
                <span>{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ border: "1px solid var(--admin-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--admin-surface)", borderBottom: "1px solid var(--admin-border)" }}>
              <h3 style={{ fontSize: "var(--font-sm)", fontWeight: 600, margin: 0 }}>Tidslinje</h3>
            </div>
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              {order.events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) 0",
                  }}
                >
                  <span
                    className="material-symbols-rounded"
                    style={{ fontSize: 16, color: "var(--admin-text-tertiary)", marginTop: 2 }}
                  >
                    {EVENT_ICONS[event.type] ?? "info"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text)" }}>
                      {event.message ?? event.type}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--admin-text-tertiary)", marginTop: 2 }}>
                      {new Date(event.createdAt).toLocaleString("sv-SE")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — customer info + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Customer */}
          <div style={{ border: "1px solid var(--admin-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
            <h3 style={{ fontSize: "var(--font-sm)", fontWeight: 600, margin: "0 0 var(--space-3)" }}>Kund</h3>
            <div style={{ fontSize: "var(--font-sm)", marginBottom: "var(--space-1)" }}>{order.guestName || "—"}</div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)" }}>{order.guestEmail}</div>
            {order.guestPhone && (
              <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)", marginTop: 2 }}>{order.guestPhone}</div>
            )}
          </div>

          {/* Payment info */}
          <div style={{ border: "1px solid var(--admin-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
            <h3 style={{ fontSize: "var(--font-sm)", fontWeight: 600, margin: "0 0 var(--space-3)" }}>Betalning</h3>
            {order.stripePaymentIntentId ? (
              <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)", fontFamily: "var(--sf-mono, monospace)", wordBreak: "break-all" }}>
                {order.stripePaymentIntentId}
              </div>
            ) : (
              <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>
                Ingen betalning registrerad
              </div>
            )}
            {order.paidAt && (
              <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: "var(--space-2)" }}>
                Betalad {new Date(order.paidAt).toLocaleString("sv-SE")}
              </div>
            )}
          </div>

          {/* Actions */}
          {(order.status === "PAID" || order.status === "PENDING") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {order.status === "PAID" && (
                <button
                  className="admin-btn admin-btn--accent"
                  onClick={handleFulfill}
                  disabled={isPending}
                >
                  Markera som levererad
                </button>
              )}
              {order.status === "PENDING" && (
                <button
                  className="admin-btn admin-btn--danger-secondary"
                  onClick={handleCancel}
                  disabled={isPending}
                >
                  Avboka order
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
