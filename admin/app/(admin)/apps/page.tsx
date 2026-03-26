import { getAllApps } from "@/app/_lib/apps/registry";
import { getInstalledApps } from "@/app/_lib/apps/actions";
import { getSetupStatus } from "@/app/_lib/apps/setup";
import { getHealthForApps } from "@/app/_lib/apps/health";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { AppsClient } from "./AppsClient";

// Force registration of all app definitions
import "@/app/_lib/apps/definitions/google-ads";
import "@/app/_lib/apps/definitions/meta-ads";
import "@/app/_lib/apps/definitions/email-marketing";
import "@/app/_lib/apps/definitions/channel-manager";
import "@/app/_lib/apps/definitions/revenue-analytics";
import "@/app/_lib/apps/definitions/guest-crm";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const tenantData = await getCurrentTenant();
  const tenantId = tenantData?.tenant.id;

  const [apps, installed, setup, healthStates] = await Promise.all([
    Promise.resolve(getAllApps()),
    getInstalledApps(),
    tenantId ? getSetupStatus(tenantId) : Promise.resolve({ pms: { complete: false }, payments: { complete: false }, isReadyForApps: false }),
    getHealthForApps(),
  ]);

  // Serialize dates for client
  const serializedInstalled = JSON.parse(JSON.stringify(installed));

  return <AppsClient apps={apps} installed={serializedInstalled} setup={setup} healthStates={healthStates} />;
}
