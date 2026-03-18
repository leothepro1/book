import { getDraftConfig } from "../_lib/tenant/getDraftConfig";
import MenusClient from "./MenusClient";

export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const initialConfig = await getDraftConfig();

  if (!initialConfig) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "var(--admin-text-secondary)" }}>Ingen konfiguration hittades.</p>
      </div>
    );
  }

  return <MenusClient initialConfig={initialConfig} />;
}
