"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

// ── Types ────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  totalAmount: number;
  imageUrl: string | null;
}

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  lineItems: LineItem[];
}

interface OrdersClientProps {
  orders: Order[];
  pageStyles?: Record<string, string>;
}

// ── Status ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Väntar på betalning",
  PAID: "Betald",
  FULFILLED: "Slutförd",
  REFUNDED: "Återbetald",
  CANCELLED: "Avbruten",
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "ord__status--pending",
  PAID: "ord__status--paid",
  FULFILLED: "ord__status--fulfilled",
  REFUNDED: "ord__status--refunded",
  CANCELLED: "ord__status--cancelled",
};

// ── Component ────────────────────────────────────────────────────

export default function OrdersClient({ orders, pageStyles }: OrdersClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);

  // Apply server-rendered page styles
  useEffect(() => {
    if (!rootRef.current || !pageStyles) return;
    for (const [varName, value] of Object.entries(pageStyles)) {
      rootRef.current.style.setProperty(varName, value);
    }
  }, [pageStyles]);

  // Live CSS variable updates from editor
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "checkin-css-update" && e.data.vars && rootRef.current) {
        const fontFamilies: string[] = [];
        for (const [varName, value] of Object.entries(e.data.vars)) {
          rootRef.current.style.setProperty(varName, value as string);
          if (varName.startsWith("--font-") && typeof value === "string") {
            const family = value.split(",")[0].trim();
            if (family) fontFamilies.push(family);
          }
        }
        if (fontFamilies.length > 0) {
          const params = fontFamilies
            .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
            .join("&");
          const url = `https://fonts.googleapis.com/css2?${params}&display=swap`;
          if (fontLinkRef.current) {
            fontLinkRef.current.href = url;
          } else {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = url;
            document.head.appendChild(link);
            fontLinkRef.current = link;
          }
        }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (fontLinkRef.current) {
        fontLinkRef.current.remove();
        fontLinkRef.current = null;
      }
    };
  }, []);

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase().trim();
    return orders.filter((o) => {
      const haystack = [
        `#${o.orderNumber}`,
        String(o.orderNumber),
        ...o.lineItems.map((li) => li.title),
        ...o.lineItems.map((li) => li.variantTitle ?? ""),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search]);

  const active = filtered.filter((o) => o.status === "PENDING" || o.status === "PAID");
  const past = filtered.filter((o) => o.status === "FULFILLED" || o.status === "REFUNDED");
  const hasResults = active.length > 0 || past.length > 0;

  return (
    <div ref={rootRef} className="acc">
      <div className="acc__container">
        <div className="acc__header">
          <div className="ord__top">
            <h1 className="acc__title">Bokningar</h1>
            <div className="ord__search">
              <svg className="ord__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <input
                type="text"
                className="ord__search-input"
                placeholder="Sök efter ordernummer eller produkt"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {orders.length === 0 && (
          <div className="ord__empty">
            <span className="material-symbols-rounded ord__empty-icon" aria-hidden="true">receipt_long</span>
            <p className="ord__empty-text">Du har inga bokningar ännu.</p>
          </div>
        )}

        {orders.length > 0 && !hasResults && (
          <div className="ord__empty">
            <p className="ord__empty-text">Inga bokningar matchar &ldquo;{search}&rdquo;</p>
          </div>
        )}

        {active.length > 0 && (
          <OrderSection title="Aktuella" orders={active} />
        )}

        {past.length > 0 && (
          <OrderSection title="Tidigare" orders={past} />
        )}
      </div>
    </div>
  );
}

// ── Order section ────────────────────────────────────────────────

function OrderSection({ title, orders }: { title: string; orders: Order[] }) {
  return (
    <section className="ord__section">
      <h2 className="ord__section-title">{title}</h2>
      <div className="ord__list">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}

// ── Order card ───────────────────────────────────────────────────

function OrderCard({ order }: { order: Order }) {
  const date = new Date(order.createdAt);
  const formattedDate = date.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="ord__card">
      {/* Header row */}
      <div className="ord__card-header">
        <span className="ord__card-number">#{order.orderNumber}</span>
        <span className={`ord__status ${STATUS_CLASS[order.status] ?? ""}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {/* Line items */}
      <div className="ord__items">
        {order.lineItems.map((li) => (
          <div key={li.id} className="ord__item">
            {li.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={li.imageUrl} alt="" className="ord__item-img" />
            )}
            <div className="ord__item-info">
              <span className="ord__item-title">{li.title}</span>
              {li.variantTitle && (
                <span className="ord__item-variant">{li.variantTitle}</span>
              )}
            </div>
            <span className="ord__item-qty">×{li.quantity}</span>
          </div>
        ))}
      </div>

      {/* Footer row */}
      <div className="ord__card-footer">
        <span className="ord__card-date">{formattedDate}</span>
        <span className="ord__card-total">{formatPriceDisplay(order.totalAmount, order.currency)} {order.currency}</span>
      </div>
    </div>
  );
}
