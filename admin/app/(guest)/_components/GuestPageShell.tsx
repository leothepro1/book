import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { themeToStyleAttr, backgroundStyle } from "../_lib/theme";
import GuestHeader from "./GuestHeader";
import GuestFooter from "./GuestFooter";
import { EmbedProvider } from "./EmbedOverlay";

/**
 * Wraps guest portal page content with theme CSS vars, background, header, and footer.
 * Each page passes its own config (resolved from the correct tenant).
 * Replaces the old layout-level config fetch that was hardcoded to a single tenant.
 */
export default function GuestPageShell({
  config,
  children,
}: {
  config: TenantConfig;
  children: React.ReactNode;
}) {
  const cssVars = themeToStyleAttr(config.theme);
  const bgStyle = backgroundStyle(config.theme.background, config.theme.colors);

  return (
    <div style={cssVars} className="g-body">
      <div style={bgStyle} className="min-h-dvh flex flex-col">
        <EmbedProvider>
          <GuestHeader config={config} />
          <main className="flex-1">{children}</main>
          <GuestFooter config={config} />
        </EmbedProvider>
      </div>
    </div>
  );
}
