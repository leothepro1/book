import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { LAYOUT_DEFAULTS } from "@/app/(guest)/_lib/tenant/types";
import { themeToStyleAttr, backgroundStyle } from "../_lib/theme";
import GuestHeader from "./GuestHeader";
import GuestFooter from "./GuestFooter";
import { EmbedProvider } from "./EmbedOverlay";
import "./guest-page-shell.css";

/**
 * Wraps booking engine page content with theme CSS vars, background, header, and footer.
 * Each page passes its own config (resolved from the correct tenant).
 *
 * Injects --layout-max-width CSS variable from config.layout.maxWidth.
 * Desktop viewports use this to constrain content width with horizontal padding.
 */
export default function GuestPageShell({
  config,
  children,
}: {
  config: TenantConfig;
  children: React.ReactNode;
}) {
  const cssVars = config.theme ? themeToStyleAttr(config.theme) : {};
  const bgStyle = config.theme?.background && config.theme?.colors
    ? backgroundStyle(config.theme.background, config.theme.colors)
    : {};
  const maxWidth = config.layout?.maxWidth ?? LAYOUT_DEFAULTS.maxWidth;

  const shellVars: React.CSSProperties = {
    ...cssVars,
    "--layout-max-width": `${maxWidth}px`,
  } as React.CSSProperties;

  return (
    <div style={shellVars} className="g-body">
      <div style={bgStyle} className="min-h-dvh flex flex-col">
        <EmbedProvider>
          <GuestHeader config={config} />
          <main className="g-main flex-1">
            <div className="g-content">{children}</div>
          </main>
          <GuestFooter config={config} />
        </EmbedProvider>
      </div>
    </div>
  );
}
