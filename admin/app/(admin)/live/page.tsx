import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { notFound } from "next/navigation";
import LiveViewClient from "./LiveViewClient";
import "./live.css";

export const dynamic = "force-dynamic";

export default async function LiveViewPage() {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return notFound();

  return (
    <div className="admin-page admin-page--no-preview live-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>radio_button_checked</span>
            Live-vy
            <span className="live-badge">Nyss</span>
          </h1>
          <div className="live-header-actions">
            <div className="live-search-wrap">
              <span className="material-symbols-rounded">search</span>
              <input className="live-search" type="text" placeholder="Sök plats" readOnly />
            </div>
            <button className="live-header-btn" type="button">
              <span className="material-symbols-rounded">visibility</span>
            </button>
            <button className="live-header-btn" type="button">
              <span className="material-symbols-rounded">grid_view</span>
            </button>
            <button className="live-header-btn" type="button">
              <span className="material-symbols-rounded">open_in_full</span>
            </button>
          </div>
        </div>
        <div className="admin-content">
          <LiveViewClient tenantId={tenantData.tenant.id} currency="SEK" />
        </div>
      </div>
    </div>
  );
}
