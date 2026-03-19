import { getDraftConfig } from "@/app/(admin)/_lib/tenant/getDraftConfig";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getCardDesign, formatDateRange } from "@/app/_lib/access-pass/card-design";
import { resolveWalletDesignFromConfig } from "@/app/_lib/access-pass/resolveFromPageSettings";
import SuccessPreviewClient from "./SuccessPreviewClient";

export const dynamic = "force-dynamic";

export default async function SuccessPreviewPage() {
  const [initialConfig, tenantData] = await Promise.all([
    getDraftConfig(),
    getCurrentTenant(),
  ]);

  if (!initialConfig || !tenantData) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "#999" }}>Ingen tenant hittades.</p>
      </div>
    );
  }

  const fromConfig = resolveWalletDesignFromConfig(initialConfig);
  const cardDesign = fromConfig ?? await getCardDesign(tenantData.tenant.id);

  const now = new Date();
  const checkout = new Date(now.getTime() + 3 * 86400000);
  const dateLabel = formatDateRange(now, checkout);

  // Collect image URLs to preload — ensures they're cached before animation starts
  const preloadUrls: string[] = [];
  if (cardDesign.logoUrl) preloadUrls.push(cardDesign.logoUrl);
  if (cardDesign.background.mode === "IMAGE") preloadUrls.push(cardDesign.background.imageUrl);

  return (
    <>
      {/* Preload card images — browser fetches before first paint */}
      {preloadUrls.map((url) => (
        <link key={url} rel="preload" as="image" href={url} />
      ))}
      <SuccessPreviewClient
        initialConfig={initialConfig}
        cardDesign={cardDesign}
        dateLabel={dateLabel}
      />
    </>
  );
}
