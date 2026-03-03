import { getDraftConfig } from "../_lib/tenant/getDraftConfig";
import PreviewDemoClient from "./PreviewDemoClient";

export const dynamic = "force-dynamic";

export default async function PreviewDemoPage() {
  const initialConfig = await getDraftConfig();

  if (!initialConfig) {
    return (
      <div style={{ padding: 40 }}>
        <p>No tenant config found. Please log in.</p>
      </div>
    );
  }

  return <PreviewDemoClient initialConfig={initialConfig} />;
}
