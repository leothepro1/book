import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { LAYOUT_DEFAULTS } from "@/app/(guest)/_lib/tenant/types";
import { themeToStyleAttr, backgroundStyle } from "../_lib/theme";
import { resolveThemeLayout, resolveThemeLayoutVars, renderSidebarSlots } from "../_lib/themes/engine";
import GuestHeader from "./GuestHeader";
import GuestFooter from "./GuestFooter";
import { SidebarLayout } from "./SidebarLayout";
import { EmbedProvider } from "./EmbedOverlay";
import "./guest-page-shell.css";

/**
 * Wraps booking engine page content with theme CSS vars, background, header, and footer.
 * Each page passes its own config (resolved from the correct tenant).
 *
 * Injects --layout-max-width CSS variable from config.layout.maxWidth.
 * Desktop viewports use this to constrain content width with horizontal padding.
 *
 * When the active theme declares layout: "sidebar-left", wraps content in
 * SidebarLayout with sidebar slots from the theme manifest. SidebarLayout
 * handles route-based exclusion (checkout pages hide the sidebar).
 */
export default async function GuestPageShell({
  config,
  children,
  pageId,
}: {
  config: TenantConfig;
  children: React.ReactNode;
  pageId?: string;
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

  // Resolve theme layout — awaits registry bootstrap
  const layout = await resolveThemeLayout(config);
  const isSidebar = layout === "sidebar-left";

  // Inject theme layout vars (--page-padding, --sidebar-width)
  const layoutVars = resolveThemeLayoutVars(config);
  Object.assign(shellVars, layoutVars);

  // When theme layout is sidebar-left, render sidebar slots from the
  // theme manifest. renderSidebarSlots returns null if no slots exist.
  // SidebarLayout handles route-based exclusion (e.g. checkout).
  const sidebarContent = isSidebar ? renderSidebarSlots(config) : null;

  return (
    <div style={shellVars} className="g-body">
      <div style={bgStyle} className="min-h-dvh flex flex-col">
        <EmbedProvider>
          <GuestHeader config={config} />
          <main className="g-main flex-1">
            {sidebarContent ? (
              <SidebarLayout sidebar={sidebarContent}>
                <div className="g-content">{children}</div>
              </SidebarLayout>
            ) : (
              <div className="g-content">{children}</div>
            )}
          </main>
          <GuestFooter config={config} />
        </EmbedProvider>
      </div>
    </div>
  );
}
