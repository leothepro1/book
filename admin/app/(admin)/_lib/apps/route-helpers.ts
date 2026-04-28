/**
 * Apps section routing — single source of truth for the conditional
 * sidebar link target and active-state matching.
 *
 * Two pages, one entry point:
 *   - `/apps`           — marketplace / browse-and-install (default landing
 *                         when no apps are installed)
 *   - `/apps/installed` — manage / overview of installed apps (landing
 *                         when at least one app is active)
 *
 * The sidebar Appar item routes to whichever is appropriate based on the
 * tenant's installed-app count. Renaming or restructuring these paths
 * happens HERE — every consumer imports from this module.
 */

/** Marketplace / install entry. */
export const APPS_MARKETPLACE_PATH = '/apps';

/** Installed-apps overview. Only navigated to when ≥1 app is active. */
export const APPS_INSTALLED_PATH = '/apps/installed';

/**
 * Pick the sidebar link target based on the count of active apps.
 *
 * Defensive on negative / NaN — treats anything <= 0 as "no apps".
 */
export function getApparHref(installedCount: number): string {
  return installedCount > 0 ? APPS_INSTALLED_PATH : APPS_MARKETPLACE_PATH;
}

/**
 * True when the given pathname is anywhere inside the apps area —
 * marketplace, installed overview, or an individual app's pages
 * (`/apps/{appId}/...`). Used for sidebar active highlighting.
 */
export function isApparActivePath(pathname: string): boolean {
  return pathname === APPS_MARKETPLACE_PATH || pathname.startsWith(APPS_MARKETPLACE_PATH + '/');
}
