import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getDraftConfig } from "@/app/(admin)/_lib/tenant/getDraftConfig";
import { getCardDesign, formatDateRange } from "@/app/_lib/access-pass/card-design";
import { resolveWalletDesignFromConfig } from "@/app/_lib/access-pass/resolveFromPageSettings";
import WalletPreviewClient from "./WalletPreviewClient";

export const dynamic = "force-dynamic";

export default async function WalletPreviewPage() {
  const tenantData = await getCurrentTenant();

  if (!tenantData) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "#999" }}>Ingen tenant hittades.</p>
      </div>
    );
  }

  // Draft config (pageSettings) is primary, WalletCardDesign model is fallback
  const draftConfig = await getDraftConfig();
  const fromConfig = resolveWalletDesignFromConfig(draftConfig);
  const cardDesign = fromConfig ?? await getCardDesign(tenantData.tenant.id);

  const now = new Date();
  const checkout = new Date(now.getTime() + 3 * 86400000);
  const dateLabel = formatDateRange(now, checkout);

  // Preload images
  const preloadUrls: string[] = [];
  if (cardDesign.logoUrl) preloadUrls.push(cardDesign.logoUrl);
  if (cardDesign.background.mode === "IMAGE") preloadUrls.push(cardDesign.background.imageUrl);

  return (
    <>
      {preloadUrls.map((url) => (
        <link key={url} rel="preload" as="image" href={url} />
      ))}
      <WalletPreviewClient cardDesign={cardDesign} dateLabel={dateLabel} />
    </>
  );
}
