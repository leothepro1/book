"use client";

import { useRouter } from "next/navigation";
import GiftCardsClient from "./GiftCardsClient";
import "./gift-cards.css";

export default function GiftCardsPage() {
  const router = useRouter();

  return (
    <div className="admin-page admin-page--no-preview products-page gc-admin-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>redeem</span>
            Presentkort
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => router.push("/gift-cards/new")}
            >
              Skapa presentkort
            </button>
          </div>
        </div>
        <div className="admin-content">
          <GiftCardsClient />
        </div>
      </div>
    </div>
  );
}
