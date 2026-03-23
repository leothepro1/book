"use client";

import { useRef } from "react";
import CollectionsClient from "./CollectionsClient";
import "../products/products.css";

export default function CollectionsPage() {
  const addRef = useRef<(() => void) | null>(null);

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>work</span>
            Produktserier
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => addRef.current?.()}
            >
              Lägg till produktserie
            </button>
          </div>
        </div>
        <div className="admin-content">
          <CollectionsClient onAddRef={addRef} />
        </div>
      </div>
    </div>
  );
}
