"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getOrders, type OrderListItem } from "../actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "../orders.css";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h sedan`;
  return `${hours}h sedan`;
}

export default function AbandonedPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const limit = 25;

  useEffect(() => {
    getOrders({ tab: "abandoned", page, limit, sortBy: "createdAt", sortDirection: "desc" }).then((result) => {
      setOrders(result.orders);
      setTotal(result.total);
      setLoaded(true);
    });
  }, [page]);

  const totalPages = Math.ceil(total / limit);

  if (!loaded) return null;

  return (
    <div className="admin-page admin-page--no-preview orders-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>shopping_cart_off</span>
            Övergivna kassor
          </h1>
        </div>
        <div className="admin-content">
          {total === 0 ? (
            <div className="ord-empty">
              <div className="ord-empty__icon">
                <EditorIcon name="shopping_cart_off" size={48} />
              </div>
              <h2 className="ord-empty__title">Inga övergivna kassor</h2>
              <p className="ord-empty__desc">
                Kassor som inte slutförs inom 1 timme visas här.
              </p>
            </div>
          ) : (
            <>
              <div className="ord-column-headers">
                <span className="ord-col ord-col--order">Kassa#</span>
                <span className="ord-col ord-col--date">Datum</span>
                <span className="ord-col ord-col--customer">Kund</span>
                <span className="ord-col ord-col--total">Totalt</span>
                <span className="ord-col ord-col--items">Tid sedan</span>
                <span className="ord-col ord-col--payment">Återhämtning</span>
                <span className="ord-col ord-col--channel" />
              </div>

              {orders.map((order) => (
                <div
                  key={order.id}
                  className="ord-row"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  <div className="ord-col ord-col--order">
                    <span className="ord-row__order-number">#{order.orderNumber}</span>
                  </div>
                  <div className="ord-col ord-col--date">
                    <span className="ord-row__date">{new Date(order.createdAt).toLocaleDateString("sv-SE")}</span>
                  </div>
                  <div className="ord-col ord-col--customer">
                    <span className="ord-row__customer-name">{order.guestEmail || order.guestName || "—"}</span>
                  </div>
                  <div className="ord-col ord-col--total">
                    <span className="ord-row__total">{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
                  </div>
                  <div className="ord-col ord-col--items">
                    <span style={{ fontSize: 12, color: "var(--admin-text-secondary)" }}>{timeAgo(order.createdAt)}</span>
                  </div>
                  <div className="ord-col ord-col--payment">
                    <span style={{
                      background: order.recoveryStatus === "contacted" ? "#E8E8E8" : "#FFD6A4",
                      color: order.recoveryStatus === "contacted" ? "#616161" : "#5E4200",
                      borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", display: "inline-block",
                    }}>
                      {order.recoveryStatus === "contacted" ? "Kontaktad" : "Ej kontaktad"}
                    </span>
                  </div>
                  <div className="ord-col ord-col--channel">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      style={{ fontSize: 12, padding: "3px 8px" }}
                      disabled
                      title="Kommer snart"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Skicka mail
                    </button>
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="files-pagination">
                  <div className="files-pagination__nav">
                    <button className="files-pagination__btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <EditorIcon name="chevron_left" size={20} />
                    </button>
                    <button className="files-pagination__btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      <EditorIcon name="chevron_right" size={20} />
                    </button>
                  </div>
                  <span className="files-pagination__label">
                    {Math.min((page - 1) * limit + 1, total)} – {Math.min(page * limit, total)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
