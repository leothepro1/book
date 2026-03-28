import { StoreClient } from "./StoreClient";
import { getCurrentTenant } from "../_lib/tenant/getCurrentTenant";
import { getPortalPerformance, type PerformanceResult } from "@/app/_lib/rum/performance";
import "./store.css";

export default async function StorePage() {
  let performance: PerformanceResult | null = null;

  try {
    const tenantData = await getCurrentTenant();
    if (tenantData) {
      performance = await getPortalPerformance(tenantData.tenant.id, 30);
    }
  } catch {
    // Performance data unavailable — widget shows empty state
  }

  return <StoreClient initialPerformance={performance} />;
}
