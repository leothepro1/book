import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getWizardState, startWizard } from "@/app/_lib/apps/wizard";
import { SetupClient } from "./SetupClient";

// Force registration of all app definitions
import "@/app/_lib/apps/definitions";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const { appId } = await params;
  let state = await getWizardState(appId);

  // Auto-create wizard record if missing (e.g. installed before this fix)
  if (!state) {
    await startWizard(appId);
    state = await getWizardState(appId);
  }

  if (!state) redirect("/apps");
  if (state.wizard.completedAt) redirect(`/apps/${appId}?installed=1`);

  // Serialize dates for client
  const serialized = JSON.parse(JSON.stringify(state));

  return <SetupClient state={serialized} />;
}
