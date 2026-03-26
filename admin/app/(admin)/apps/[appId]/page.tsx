import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getAppDetail, getAppEvents, getWebhookDeliveries } from "@/app/_lib/apps/actions";
import { getAppHealth, getAppHealthHistory } from "@/app/_lib/apps/health";
import { getAppBillingInfo } from "@/app/_lib/apps/billing";
import { getApp } from "@/app/_lib/apps/registry";
import { AppDetailClient } from "./AppDetailClient";
import { AppListingClient } from "./AppListingClient";

// Force registration
import "@/app/_lib/apps/definitions/google-ads";
import "@/app/_lib/apps/definitions/meta-ads";
import "@/app/_lib/apps/definitions/email-marketing";
import "@/app/_lib/apps/definitions/channel-manager";
import "@/app/_lib/apps/definitions/revenue-analytics";
import "@/app/_lib/apps/definitions/guest-crm";
import "@/app/_lib/apps/definitions/mailchimp";

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

  // Check if app is installed — if so, show manage page
  const detail = await getAppDetail(appId);

  if (detail && detail.status === "PENDING_SETUP") {
    redirect(`/apps/${appId}/setup`);
  }

  // Installed app → manage page
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

  // Not installed → listing page
  return <AppListingClient app={appDef} />;
}
