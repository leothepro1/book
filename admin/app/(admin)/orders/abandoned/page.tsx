"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getAbandonedSessions, getAbandonedOrders } from "../actions";
import type { AbandonedSession, AbandonedOrder } from "../actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "../orders.css";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString("sv-SE", { month: "long" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month} ${year} kl ${time}`;
}

type UnifiedRow = {
  id: string;
  source: "session" | "order";
  label: string;
  customer: string;
  dates: string;
  total: number;
  currency: string;
  createdAt: string;
  status: string;
  orderId?: string;
};

export default function AbandonedPage() {
  const router = useRouter();
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getAbandonedSessions({ page: 1, limit: 50 }),
      getAbandonedOrders({ page: 1, limit: 50 }),
    ]).then(([s, o]) => {
      const sessionRows: UnifiedRow[] = s.sessions.map((sess) => ({
        id: sess.id,
        source: "session",
        label: sess.accommodationName,
        customer: `${sess.adults} gäster`,
        dates: `${sess.checkIn} – ${sess.checkOut}`,
        total: sess.accommodationTotal + sess.addonTotal,
        currency: sess.currency,
        createdAt: sess.createdAt,
        status: sess.status === "EXPIRED" ? "Utgången" : "Övergiven",
      }));

      const orderRows: UnifiedRow[] = o.orders.map((ord) => ({
        id: ord.id,
        source: "order",
        label: ord.lineItemTitle ?? "—",
        customer: ord.guestName || ord.guestEmail || "—",
        dates: formatDate(ord.createdAt),
        total: ord.totalAmount,
        currency: ord.currency,
        createdAt: ord.createdAt,
        status: "Avbruten betalning",
        orderId: ord.id,
      }));

      const all = [...sessionRows, ...orderRows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      setRows(all);
      setLoaded(true);
    });
  }, []);

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
          {rows.length === 0 ? (
            <div className="ord-empty">
              <div className="ord-empty__icon">
                <EditorIcon name="shopping_cart_off" size={48} />
              </div>
              <h2 className="ord-empty__title">Inga övergivna kassor</h2>
              <p className="ord-empty__desc">
                Kassor som inte slutförs visas här.
              </p>
            </div>
          ) : (
            <>
              <div className="ord-column-headers">
                <span className="ord-col ord-col--order">Datum</span>
                <span className="ord-col ord-col--customer">Boende</span>
                <span className="ord-col ord-col--items">Kund / Gäster</span>
                <span className="ord-col ord-col--total">Totalt</span>
                <span className="ord-col ord-col--payment">Status</span>
              </div>

              {rows.map((row) => (
                <div
                  key={`${row.source}-${row.id}`}
                  className="ord-row"
                  style={{ cursor: row.orderId ? "pointer" : "default" }}
                  onClick={row.orderId ? () => router.push(`/orders/${row.orderId}`) : undefined}
                >
                  <div className="ord-col ord-col--order">
                    <span className="ord-row__date">{formatDate(row.createdAt)}</span>
                  </div>
                  <div className="ord-col ord-col--customer">
                    <span className="ord-row__customer-name">{row.label}</span>
                  </div>
                  <div className="ord-col ord-col--items">
                    <span style={{ fontSize: 13 }}>{row.customer}</span>
                  </div>
                  <div className="ord-col ord-col--total">
                    <span className="ord-row__total">{formatPriceDisplay(row.total, row.currency)} kr</span>
                  </div>
                  <div className="ord-col ord-col--payment">
                    <span style={{
                      background: row.status === "Avbruten betalning" ? "#FEE2E2" : row.status === "Utgången" ? "#F3F4F6" : "#FEF3C7",
                      color: row.status === "Avbruten betalning" ? "#991B1B" : row.status === "Utgången" ? "#4B5563" : "#92400E",
                      borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", display: "inline-block",
                    }}>
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
