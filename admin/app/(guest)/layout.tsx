import "./guest.css";
import type { ReactNode } from "react";
import { GclidCapture } from "./_components/GclidCapture";
import { UtmCapture } from "./_components/UtmCapture";
import { RumCollector } from "./_components/RumCollector";
import { AnalyticsProvider } from "./_components/AnalyticsProvider";
import { resolveTenantFromHost } from "./_lib/tenant/resolveTenantFromHost";

export const dynamic = "force-dynamic";

export default async function GuestLayout({ children }: { children: ReactNode }) {
  const tenant = await resolveTenantFromHost();

  return (
    <>
      <GclidCapture />
      <UtmCapture />
      {tenant && <RumCollector tenantId={tenant.id} />}
      {tenant ? (
        <AnalyticsProvider tenantId={tenant.id}>{children}</AnalyticsProvider>
      ) : (
        children
      )}
    </>
  );
}
