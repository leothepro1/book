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
        </div>
        <div className="admin-content">
          <CustomersClient />
        </div>
      </div>
    </div>
  );
}
