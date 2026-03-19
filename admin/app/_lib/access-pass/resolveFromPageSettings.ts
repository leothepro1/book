/**
 * Resolve CardDesignConfig from TenantConfig pageSettings.
 *
 * This is the primary source of truth for wallet card design in the
 * editor/draft/publish flow. Falls back to WalletCardDesign DB model
 * only if pageSettings has no wallet fields (pre-migration tenants).
 */

import type { CardDesignConfig, CardBackground } from "./card-design";
import { getPageSettings } from "@/app/_lib/pages/config";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

const DEFAULT_BG_COLOR = "#1a1a2e";
const DEFAULT_DATE_COLOR = "#ffffff";

export function resolveWalletDesignFromConfig(
  config: TenantConfig | null | undefined,
): CardDesignConfig | null {
  if (!config) return null;

  const ps = getPageSettings(config, "check-in");

  // No wallet fields in pageSettings — signal caller to fall back
  if (ps.walletBgColor === undefined) return null;

  const bgImageUrl = (ps.walletBgImageUrl as string) || "";
  const bgColor = (ps.walletBgColor as string) || DEFAULT_BG_COLOR;
  const overlayOpacity = (ps.walletOverlayOpacity as number) ?? 0.3;
  const logoUrl = (ps.walletLogoUrl as string) || null;
  const dateTextColor = (ps.walletDateColor as string) || DEFAULT_DATE_COLOR;

  let background: CardBackground;
  if (bgImageUrl) {
    background = { mode: "IMAGE", imageUrl: bgImageUrl, overlayOpacity };
  } else {
    background = { mode: "SOLID", color: bgColor };
  }

  return { background, logoUrl, dateTextColor };
}
