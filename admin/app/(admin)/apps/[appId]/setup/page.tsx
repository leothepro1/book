import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getWizardState } from "@/app/_lib/apps/wizard";
import { SetupClient } from "./SetupClient";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/apps");

  const { appId } = await params;
  const state = await getWizardState(appId);

  if (!state) redirect("/apps");
  if (state.wizard.completedAt) redirect(`/apps/${appId}?installed=1`);

  // Serialize dates for client
  const serialized = JSON.parse(JSON.stringify(state));

  return <SetupClient state={serialized} />;
}
