import { getDraftConfig } from "@/app/(admin)/_lib/tenant/getDraftConfig";
import DevTestClient from "./DevTestClient";

export const dynamic = "force-dynamic";

export default async function DevTestPage() {
  const initialConfig = await getDraftConfig();

  if (!initialConfig) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "#999" }}>Ingen tenant hittades.</p>
      </div>
    );
  }

  return <DevTestClient initialConfig={initialConfig} />;
}
