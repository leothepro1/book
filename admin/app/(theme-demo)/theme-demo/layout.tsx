import "../../(guest)/guest.css";
import type { ReactNode } from "react";

/**
 * Theme Demo Layout — minimal shell, no DB calls.
 *
 * CSS vars and fonts are applied by the page component (which already
 * fetches config). This layout only imports guest.css for base styles.
 *
 * No header, no footer, no PreviewBridge — just the theme content.
 */
export default function ThemeDemoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
