import { SegmentsClient } from "./SegmentsClient";
import "../customers.css";
import "../../files/files.css";

export default function SegmentsPage() {
  return (
    <div className="admin-page admin-page--no-preview customers-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>segment</span>
            Kundsegment
          </h1>
        </div>
        <div className="admin-content">
          <SegmentsClient />
        </div>
      </div>
    </div>
  );
}
