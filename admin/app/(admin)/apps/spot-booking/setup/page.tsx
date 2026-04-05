import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getWizardState, startWizard } from "@/app/_lib/apps/wizard";
import { SetupClient } from "@/app/(admin)/apps/[appId]/setup/SetupClient";

// Force registration of all app definitions
import "@/app/_lib/apps/definitions";

export const dynamic = "force-dynamic";

export default async function SpotBookingSetupPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const appId = "spot-booking";
  let state = await getWizardState(appId);

  // Auto-create wizard record if missing
  if (!state) {
    await startWizard(appId);
    state = await getWizardState(appId);
  }

  if (!state) redirect("/apps");
  if (state.wizard.completedAt) redirect(`/apps/spot-booking`);

  const serialized = JSON.parse(JSON.stringify(state));

  return <SetupClient state={serialized} />;
}
