import Link from "next/link";
import { CustomersClient } from "./CustomersClient";
import "./customers.css";
import "../files/files.css";

export default function CustomersPage() {
  return (
    <div className="admin-page admin-page--no-preview customers-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>group</span>
            Kunder
          </h1>
          <div className="admin-actions">
            <Link
              href="/customers/new"
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
            >
              Skapa kund
            </Link>
          </div>
        </div>
        <div className="admin-content">
          <CustomersClient />
        </div>
      </div>
    </div>
  );
}
