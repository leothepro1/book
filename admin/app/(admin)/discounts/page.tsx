"use client";

import { Suspense, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DiscountsClient } from "./DiscountsClient";
import { Loading } from "@/app/_components/Loading/Loading";
import { EditorIcon } from "@/app/_components/EditorIcon";
import "./discounts.css";

type DiscountType = "order_amount" | "line_item_amount" | "buy_x_get_y" | "combined";

const DISCOUNT_TYPES: { key: DiscountType; title: string; desc: string; icon: string }[] = [
  { key: "order_amount", title: "Beloppsrabatt på order", desc: "Rabatt på hela ordersumman", icon: "sell" },
  { key: "line_item_amount", title: "Beloppsrabatt på produkter", desc: "Rabatt på specifika produkter", icon: "inbox" },
  { key: "buy_x_get_y", title: "Köp X få Y", desc: "Produktrabatt baserat på varukorg (Kräver produktval)", icon: "sell" },
  { key: "combined", title: "Kombinerad rabatt", desc: "Orderrabatt med bokningsvillkor", icon: "percent_discount" },
];

export default function DiscountsPage() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (showModal) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [showModal]);

  const closeModal = () => {
    setVisible(false);
    setShowModal(false);
  };

  const selectType = (key: DiscountType) => {
    closeModal();
    router.push(`/discounts/new?type=${key}`);
  };

  return (
    <div className="admin-page admin-page--no-preview discounts-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>percent_discount</span>
            Rabatter
          </h1>
          <button className="settings-btn--connect" onClick={() => setShowModal(true)}>
            Skapa rabatt
          </button>
        </div>
        <div className="admin-content">
          <Suspense fallback={<div style={{ padding: 48, display: "flex", justifyContent: "center" }}><Loading variant="section" /></div>}>
            <DiscountsClient onCreateClick={() => setShowModal(true)} />
          </Suspense>
        </div>
      </div>

      {/* Type selection modal — portal to body to escape overflow clipping */}
      {showModal && createPortal(
        <div
          className={`am-overlay${visible ? " am-overlay--visible" : ""}`}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="am-modal" style={{ width: 520 }}>
            <div className="am-modal__header">
              <h2 className="am-modal__title">Skapa rabatt</h2>
              <button className="am-modal__close" onClick={closeModal}>
                <EditorIcon name="close" size={18} />
              </button>
            </div>
            <div className="am-modal__body" style={{ padding: 0 }}>
              {DISCOUNT_TYPES.map((t) => (
                <button
                  key={t.key}
                  className="disc-type-row"
                  onClick={() => selectType(t.key)}
                >
                  <span className="disc-type-row__icon">
                    <EditorIcon name={t.icon} size={20} />
                  </span>
                  <div className="disc-type-row__text">
                    <span className="disc-type-row__title">{t.title}</span>
                    <span className="disc-type-row__desc">{t.desc}</span>
                  </div>
                  <EditorIcon name="chevron_right" size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
