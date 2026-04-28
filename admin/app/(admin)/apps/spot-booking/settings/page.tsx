import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";

/**
 * Spot-booking — Settings page (placeholder).
 *
 * Declared in the app's `pages` registry as the second drill-in page.
 * Layout/content TBD — this stub keeps the route resolvable so the
 * sidebar drill-in's "Inställningar" item doesn't 404.
 */
export default async function SpotBookingSettingsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const tenantData = await getCurrentTenant();
  if (!tenantData) redirect("/apps");

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title">Inställningar</h1>
        </div>
      </div>
    </div>
  );
}
