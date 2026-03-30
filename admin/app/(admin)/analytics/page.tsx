import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { notFound } from "next/navigation";
import AnalyticsDashboard from "./AnalyticsDashboard";
import "./analytics.css";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return notFound();

  return (
    <div className="admin-page admin-page--no-preview analytics-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>bar_chart</span>
            Analys
          </h1>
        </div>
        <div className="admin-content">
          <AnalyticsDashboard tenantId={tenantData.tenant.id} />
        </div>
      </div>
    </div>
  );
}
