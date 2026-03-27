import { OrdersClient } from "./OrdersClient";
import "./orders.css";
import "../files/files.css";

export default function OrdersPage() {
  return (
    <div className="admin-page admin-page--no-preview orders-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inbox</span>
            Ordrar
          </h1>
        </div>
        <div className="admin-content">
          <OrdersClient />
        </div>
      </div>
    </div>
  );
}
