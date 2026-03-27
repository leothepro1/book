"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getOrder, type OrderDetail } from "../actions";
import { EditorIcon } from "@/app/_components/EditorIcon";
import "../../products/_components/product-form.css";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrder(orderId)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return null;

  if (!order) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div className="admin-header pf-header">
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/orders")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>shopping_bag</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>Ordern hittades inte</span>
            </h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* Header */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/orders")}>
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>shopping_bag</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>#{order.orderNumber}</span>
          </h1>
        </div>

        {/* Body */}
        <div className="pf-body">
          {/* Main */}
          <div className="pf-main">
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Artiklar</span>
              </div>
            </div>

            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Tidslinje</span>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="pf-sidebar">
            <div style={CARD}>
              <div className="pf-card-header">
                <span className="pf-card-title">Kund</span>
              </div>
            </div>

            <div style={CARD}>
              <div className="pf-card-header">
                <span className="pf-card-title">Betalning</span>
              </div>
            </div>

            <div style={CARD}>
              <div className="pf-card-header">
                <span className="pf-card-title">Distribution</span>
              </div>
            </div>

            <div style={CARD}>
              <div className="pf-card-header">
                <span className="pf-card-title">Taggar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
