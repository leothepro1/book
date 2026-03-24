"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getOrders, type OrderListItem } from "./actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import type { OrderStatus } from "@prisma/client";
import "./orders.css";

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Väntande",
  PAID: "Betald",
  FULFILLED: "Levererad",
  CANCELLED: "Avbokad",
  REFUNDED: "Återbetald",
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING: "ord__badge--pending",
  PAID: "ord__badge--paid",
  FULFILLED: "ord__badge--fulfilled",
  CANCELLED: "ord__badge--cancelled",
  REFUNDED: "ord__badge--refunded",
};

const FILTERS: { label: string; value: OrderStatus | undefined }[] = [
  { label: "Alla", value: undefined },
  { label: "Väntande", value: "PENDING" },
  { label: "Betalda", value: "PAID" },
  { label: "Levererade", value: "FULFILLED" },
  { label: "Avbokade", value: "CANCELLED" },
  { label: "Återbetalda", value: "REFUNDED" },
];

export function OrdersClient() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getOrders({ status: statusFilter, page, limit: 25 }).then((result) => {
      setOrders(result.orders);
      setTotal(result.total);
      setLoaded(true);
    });
  }, [page, statusFilter]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="ord">
      <div className="ord__header">
        <h1 className="ord__title">Beställningar</h1>
        <span className="ord__count">{total} totalt</span>
      </div>

      {/* Filters */}
      <div className="ord__filters">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            className={`ord__filter${statusFilter === f.value ? " ord__filter--active" : ""}`}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="ord__table-wrap">
        <table className="ord__table">
          <thead>
            <tr>
              <th>Ordernr</th>
              <th>Datum</th>
              <th>Kund</th>
              <th>Produkter</th>
              <th>Totalt</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!loaded ? (
              <tr>
                <td colSpan={7} className="ord__loading">Laddar...</td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="ord__empty">Inga beställningar</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="ord__cell-num">#{order.orderNumber}</td>
                  <td className="ord__cell-date">
                    {new Date(order.createdAt).toLocaleDateString("sv-SE")}
                  </td>
                  <td>
                    <div className="ord__customer-name">{order.guestName || "—"}</div>
                    <div className="ord__customer-email">{order.guestEmail}</div>
                  </td>
                  <td className="ord__cell-products">
                    {order.productTitles.slice(0, 2).join(", ")}
                    {order.lineItemCount > 2 && ` +${order.lineItemCount - 2}`}
                  </td>
                  <td className="ord__cell-total">
                    {formatPriceDisplay(order.totalAmount, order.currency)} kr
                  </td>
                  <td>
                    <span className={`ord__badge ${STATUS_CLASSES[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td>
                    <Link href={`/orders/${order.id}`} className="ord__view-link">
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                        chevron_right
                      </span>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ord__pagination">
          <button
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Föregående
          </button>
          <span className="ord__page-info">
            Sida {page} av {totalPages}
          </span>
          <button
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Nästa
          </button>
        </div>
      )}
    </div>
  );
}
