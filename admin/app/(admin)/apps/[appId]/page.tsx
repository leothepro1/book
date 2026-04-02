import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getAppDetail, getAppEvents, getWebhookDeliveries, getInstalledApps } from "@/app/_lib/apps/actions";
import { getAppHealth, getAppHealthHistory, getHealthForApps } from "@/app/_lib/apps/health";
import { getAppBillingInfo } from "@/app/_lib/apps/billing";
import { getApp, getAllApps } from "@/app/_lib/apps/registry";
import { getSetupStatus } from "@/app/_lib/apps/setup";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { AppDetailClient } from "./AppDetailClient";
import { AppsClient } from "../AppsClient";

// Force registration of all app definitions
import "@/app/_lib/apps/definitions";

export const dynamic = "force-dynamic";

export default async function AppPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const { appId } = await params;
  const appDef = getApp(appId);
  if (!appDef) redirect("/apps");

  // Check if app is installed
  const detail = await getAppDetail(appId);

  if (detail && detail.status === "PENDING_SETUP") {
    redirect(`/apps/${appId}/setup`);
  }

  // Installed app → full management page
  if (detail) {
    const hasWebhooks = appDef.webhooks.length > 0;
    const hasPaidTiers = appDef.pricing.some((p) => p.pricePerMonth > 0);

    const [events, health, healthHistory, deliveries, billingInfo] = await Promise.all([
      getAppEvents(appId, 50),
      getAppHealth(appId),
      appDef.healthCheck ? getAppHealthHistory(appId) : Promise.resolve([]),
      hasWebhooks ? getWebhookDeliveries(appId, 20) : Promise.resolve([]),
      hasPaidTiers ? getAppBillingInfo(appId) : Promise.resolve(null),
    ]);

    return (
      <AppDetailClient
        app={appDef}
        detail={detail}
        events={events}
        health={health}
        healthHistory={healthHistory}
        deliveries={deliveries}
        billingInfo={billingInfo}
      />
    );
  }

  // Not installed → app listing page
  const tenantData = await getCurrentTenant();
  const tenantId = tenantData?.tenant.id;

  const setup = tenantId
    ? await getSetupStatus(tenantId)
    : { pms: { complete: false }, payments: { complete: false }, isReadyForApps: false };

  const { AppListingPage } = await import("./AppListingPage");

  return <AppListingPage app={appDef} status={null} setupReady={setup.isReadyForApps} />;
}
