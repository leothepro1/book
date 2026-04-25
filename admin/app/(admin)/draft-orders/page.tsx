import Link from "next/link";
import { DraftOrdersClient } from "./DraftOrdersClient";
import "../orders/orders.css";
import "../files/files.css";

export default function DraftOrdersPage() {
  return (
    <div className="admin-page admin-page--no-preview orders-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>draft</span>
            Utkastordrar
          </h1>
          <div className="admin-actions">
            <Link href="/draft-orders/new" className="admin-btn admin-btn--accent">
              Skapa order
            </Link>
          </div>
        </div>
        <div className="admin-content">
          <DraftOrdersClient />
        </div>
      </div>
    </div>
  );
}
