import { getDraftConfig } from "../_lib/tenant/getDraftConfig";
import PreviewTestClient from "./PreviewTestClient";

export const dynamic = "force-dynamic";

/**
 * Preview Test Page - Demo av GuestPreview komponenten
 * 
 * Denna sida visar hur preview används i practice.
 */
export default async function PreviewTestPage() {
  // Hämta initial config (server-side)
  const initialConfig = await getDraftConfig();

  if (!initialConfig) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Preview Test</h1>
        <p>No tenant config found. Make sure you're logged in to an organization.</p>
      </div>
    );
  }

  return <PreviewTestClient initialConfig={initialConfig} />;
}
