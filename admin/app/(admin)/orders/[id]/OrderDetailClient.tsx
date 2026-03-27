"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrder, fulfillOrder, cancelOrder, type OrderDetail } from "../actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { EditorIcon } from "@/app/_components/EditorIcon";
import "../../products/_components/product-form.css";
import "../orders.css";

// ── Helpers ──────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const CARD_NO_PAD: React.CSSProperties = { ...CARD, padding: 0 };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

function financialLabel(s: string): { label: string; cls: string } {
  switch (s) {
    case "PENDING":            return { label: "Väntande", cls: "ord-badge--pending" };
    case "AUTHORIZED":         return { label: "Auktoriserad", cls: "ord-badge--pending" };
    case "PAID":               return { label: "Betald", cls: "ord-badge--paid" };
    case "PARTIALLY_REFUNDED": return { label: "Delvis återbetald", cls: "ord-badge--unfulfilled" };
    case "REFUNDED":           return { label: "Återbetald", cls: "ord-badge--refunded" };
    case "VOIDED":             return { label: "Annullerad", cls: "ord-badge--cancelled" };
    default:                   return { label: s, cls: "" };
  }
}

function fulfillmentLabel(s: string): { label: string; cls: string } {
  switch (s) {
    case "UNFULFILLED": return { label: "Ej levererad", cls: "ord-badge--unfulfilled" };
    case "SCHEDULED":   return { label: "Schemalagd", cls: "ord-badge--pending" };
    case "IN_PROGRESS": return { label: "Pågående", cls: "ord-badge--paid" };
    case "FULFILLED":   return { label: "Levererad", cls: "ord-badge--fulfilled" };
    case "ON_HOLD":     return { label: "Pausad", cls: "ord-badge--pending" };
    case "CANCELLED":   return { label: "Avbokad", cls: "ord-badge--cancelled" };
    default:            return { label: s, cls: "" };
  }
}

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
  PAYMENT_FAILED: "error",
  GUEST_INFO_UPDATED: "person",
  RECONCILED: "sync",
  CHANNEL_ORDER_RECEIVED: "device_hub",
  CHECKIN_CONFIRMED: "login",
  CHECKOUT_CONFIRMED: "logout",
};

const CHANNEL_LABELS: Record<string, string> = {
  direct: "Webbshop",
  booking_com: "Booking.com",
  expedia: "Expedia",
};

// ── Component ────────────────────────────────────────────────

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrder(orderId).then(setOrder).finally(() => setLoading(false));
  }, [orderId]);

  const handleFulfill = () => {
    setError(null);
    startTransition(async () => {
      const result = await fulfillOrder(orderId);
      if (!result.ok) { setError(result.error); return; }
      setOrder(await getOrder(orderId));
    });
  };

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (!result.ok) { setError(result.error); return; }
      setOrder(await getOrder(orderId));
    });
  };

  if (loading) return null;

  if (!order) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div className="admin-header pf-header">
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/orders")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inbox</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>Ordern hittades inte</span>
            </h1>
          </div>
        </div>
      </div>
    );
  }

  const fin = financialLabel(order.financialStatus);
  const ful = fulfillmentLabel(order.fulfillmentStatus);
  const channelName = CHANNEL_LABELS[order.sourceChannel ?? "direct"] ?? order.sourceChannel ?? "Webbshop";
  const createdDate = new Date(order.createdAt);
  const subtitle = `${createdDate.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })} kl ${createdDate.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })} från ${channelName}`;

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* Header */}
        <div className="admin-header pf-header">
          <div>
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/orders")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inbox</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>#{order.orderNumber}</span>
            </h1>
            <div className="ord-header-subtitle">{subtitle}</div>
          </div>
          <div className="pf-header__actions">
            <span className={`ord-badge ${fin.cls}`}>{fin.label}</span>
            <span className={`ord-badge ${ful.cls}`}>{ful.label}</span>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="pf-error-banner">
            <EditorIcon name="error" size={16} />
            {error}
            <button className="pf-error-banner__close" onClick={() => setError(null)}>
              <EditorIcon name="close" size={14} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="pf-body">
          {/* ── Main column ─────────────────────────────── */}
          <div className="pf-main">

            {/* Artiklar */}
            <div style={CARD_NO_PAD}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border)" }}>
                <span className="pf-card-title">Artiklar</span>
              </div>
              {order.lineItems.map((item) => (
                <div key={item.id} className="ord-detail-item">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.title} className="ord-detail-item__img" />
                  )}
                  {!item.imageUrl && (
                    <div className="ord-detail-item__img ord-detail-item__img--empty">
                      <EditorIcon name="image" size={18} />
                    </div>
                  )}
                  <div className="ord-detail-item__info">
                    <div className="ord-detail-item__title">{item.title}</div>
                    {item.variantTitle && (
                      <div className="ord-detail-item__variant">{item.variantTitle}</div>
                    )}
                  </div>
                  <div className="ord-detail-item__qty">
                    {item.quantity} × {formatPriceDisplay(item.unitAmount, item.currency)} kr
                  </div>
                  <div className="ord-detail-item__total">
                    {formatPriceDisplay(item.totalAmount, item.currency)} kr
                  </div>
                </div>
              ))}
              <div className="ord-detail-totals">
                <div className="ord-detail-totals__row">
                  <span className="ord-detail-totals__label">Delsumma</span>
                  <span>{formatPriceDisplay(order.subtotalAmount, order.currency)} kr</span>
                </div>
                {order.taxAmount > 0 && (
                  <div className="ord-detail-totals__row">
                    <span className="ord-detail-totals__label">Moms</span>
                    <span>{formatPriceDisplay(order.taxAmount, order.currency)} kr</span>
                  </div>
                )}
                <div className="ord-detail-totals__row ord-detail-totals__row--total">
                  <span>Totalt</span>
                  <span>{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
                </div>
              </div>
            </div>

            {/* Tidslinje */}
            <div style={CARD_NO_PAD}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border)" }}>
                <span className="pf-card-title">Tidslinje</span>
              </div>
              <div className="ord-timeline">
                {order.events.map((event) => (
                  <div key={event.id} className="ord-timeline__item">
                    <div className="ord-timeline__icon">
                      <EditorIcon name={EVENT_ICONS[event.type] ?? "info"} size={16} />
                    </div>
                    <div className="ord-timeline__content">
                      <div className="ord-timeline__message">{event.message ?? event.type}</div>
                      <div className="ord-timeline__time">{formatDate(event.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sidebar ─────────────────────────────────── */}
          <div className="pf-sidebar">

            {/* Kund */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Kund</span>
              </div>
              <div className="ord-detail-field">{order.guestName || "—"}</div>
              <div className="ord-detail-field ord-detail-field--secondary">{order.guestEmail}</div>
              {order.guestPhone && (
                <div className="ord-detail-field ord-detail-field--secondary">{order.guestPhone}</div>
              )}
            </div>

            {/* Betalning */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Betalning</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span className={`ord-badge ${fin.cls}`}>{fin.label}</span>
              </div>
              {order.paidAt && (
                <div className="ord-detail-field ord-detail-field--secondary">
                  Betald {formatShortDate(order.paidAt)}
                </div>
              )}
              {order.refundedAt && (
                <div className="ord-detail-field ord-detail-field--secondary">
                  Återbetald {formatShortDate(order.refundedAt)}
                </div>
              )}
              {order.stripePaymentIntentId && (
                <div className="ord-detail-field ord-detail-field--mono">
                  {order.stripePaymentIntentId}
                </div>
              )}
            </div>

            {/* Distribution */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Distribution</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span className={`ord-badge ${ful.cls}`}>{ful.label}</span>
              </div>
              {order.fulfilledAt && (
                <div className="ord-detail-field ord-detail-field--secondary">
                  Levererad {formatShortDate(order.fulfilledAt)}
                </div>
              )}
              {order.cancelledAt && (
                <div className="ord-detail-field ord-detail-field--secondary">
                  Avbokad {formatShortDate(order.cancelledAt)}
                </div>
              )}

              {/* Actions */}
              {order.financialStatus === "PAID" && order.fulfillmentStatus === "UNFULFILLED" && (
                <button
                  className="admin-btn admin-btn--accent"
                  style={{ width: "100%", marginTop: 12 }}
                  onClick={handleFulfill}
                  disabled={isPending}
                >
                  Markera som levererad
                </button>
              )}
              {order.financialStatus === "PENDING" && (
                <button
                  className="admin-btn admin-btn--danger-secondary"
                  style={{ width: "100%", marginTop: 12 }}
                  onClick={handleCancel}
                  disabled={isPending}
                >
                  Avboka order
                </button>
              )}
            </div>

            {/* Kanal */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Kanal</span>
              </div>
              <div className="ord-detail-field">
                {CHANNEL_LABELS[order.sourceChannel ?? "direct"] ?? order.sourceChannel ?? "Webbshop"}
              </div>
              {order.sourceExternalId && (
                <div className="ord-detail-field ord-detail-field--mono">
                  {order.sourceExternalId}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
