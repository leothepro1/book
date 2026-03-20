import "./checkin.css";

import { Suspense } from "react";
import CheckInClient from "./ui";
import { checkInLookup, checkInCommit } from "./actions";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { CheckInDisabled } from "./CheckInDisabled";
import { getTenantConfig } from "../_lib/tenant";
import { getActiveCheckinCards, getPageSettings } from "@/app/_lib/pages/config";
import { getCardDesign } from "@/app/_lib/access-pass/card-design";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { resolveWalletDesignFromConfig } from "@/app/_lib/access-pass/resolveFromPageSettings";

export const dynamic = "force-dynamic";

export default async function Page() {
  const tenant = await resolveTenantFromHost();

  if (!tenant || !tenant.checkinEnabled) {
    return <CheckInDisabled />;
  }

  const config = await getTenantConfig(tenant.id);

  // Published config (pageSettings) is primary, WalletCardDesign model is fallback
  const fromConfig = resolveWalletDesignFromConfig(config);
  const cardDesign = fromConfig ?? await getCardDesign(tenant.id);

  const activeCards = getActiveCheckinCards(config);
  const ps = getPageSettings(config, "check-in");

  // Build CSS variables from page settings
  const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const fontStack = (key: string) => {
    const f = FONT_CATALOG.find((c) => c.key === key);
    if (!f) return SANS_FALLBACK;
    return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
  };

  const checkinStyles: Record<string, string> = {
    "--background": (ps.backgroundColor as string) || "#FFFFFF",
    "--text": (ps.textColor as string) || "#121212",
    "--button-bg": (ps.buttonColor as string) || "#121212",
    "--button-fg": "#FFFFFF",
    "--accent": (ps.accentColor as string) || "#121212",
    "--border-color": (ps.borderColor as string) || "#D7DADE",
    "--font-heading": fontStack((ps.headingFont as string) || "inter"),
    "--font-body": fontStack((ps.bodyFont as string) || "inter"),
    "--font-button": fontStack((ps.buttonFont as string) || "inter"),
    "--field-bg": (ps.fieldStyle as string) === "transparent" ? "transparent" : "#fff",
    "--field-text": (ps.fieldStyle as string) === "transparent" ? (ps.textColor as string) || "#121212" : "#121212",
  };

  // Preload wallet card images
  const preloadUrls: string[] = [];
  if (cardDesign.logoUrl) preloadUrls.push(cardDesign.logoUrl);
  if (cardDesign.background.mode === "IMAGE") preloadUrls.push(cardDesign.background.imageUrl);

  return (
    <>
      {preloadUrls.map((url) => (
        <link key={url} rel="preload" as="image" href={url} />
      ))}
      <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
        <CheckInClient
          onLookup={checkInLookup}
          onCommit={checkInCommit}
          activeCards={activeCards}
          checkInTime={config.property?.checkInTime || "15:00"}
          cardDesign={cardDesign}
          tenantName={config.property?.name || ""}
          checkinStyles={checkinStyles}
        />
      </Suspense>
    </>
  );
}
