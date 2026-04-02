import { getDraftConfig } from "@/app/(admin)/_lib/tenant/getDraftConfig";
import EditorClient from "../EditorClient";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const initialConfig = await getDraftConfig();

  if (!initialConfig) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "#FBFAF9" }}>
        <p style={{ color: "#6D6C6B" }}>No tenant config found. Please log in.</p>
      </div>
    );
  }

  return <EditorClient initialConfig={initialConfig} />;
}
