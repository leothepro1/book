import { getDraftConfig } from "../_lib/tenant/getDraftConfig";
import DesignClient from "./DesignClient";

export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const initialConfig = await getDraftConfig();

  if (!initialConfig) {
    return (
      <div className="p-10">
        <p className="text-gray-500">No tenant config found. Please log in.</p>
      </div>
    );
  }

  return <DesignClient initialConfig={initialConfig} />;
}
