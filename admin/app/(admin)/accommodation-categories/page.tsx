"use client";

import { useRef } from "react";
import AccommodationCategoriesClient from "./AccommodationCategoriesClient";
import "../products/products.css";
import "../accommodations/accommodations.css";

export default function AccommodationCategoriesPage() {
  const addRef = useRef<(() => void) | null>(null);

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>villa</span>
            Boendetyper
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => addRef.current?.()}
            >
              Lägg till boendetyp
            </button>
          </div>
        </div>
        <div className="admin-content">
          <AccommodationCategoriesClient onAddRef={addRef} />
        </div>
      </div>
    </div>
  );
}
