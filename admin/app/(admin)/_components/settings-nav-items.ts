/**
 * Settings sidebar registry.
 *
 * Single source of truth for the settings drill-in nav.
 *
 * Order in this array determines display order AND the default active tab —
 * the first item that the current role can see is selected on entry.
 * Reordering items here automatically updates the default.
 */

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: string;
  /** Hidden for non-admin org members. */
  adminOnly?: boolean;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'organization', label: 'Organisation', icon: 'corporate_fare', adminOnly: true },
  { id: 'users', label: 'Användare', icon: 'face', adminOnly: true },
  { id: 'billing', label: 'Fakturering', icon: 'contract', adminOnly: true },
  { id: 'payments', label: 'Betalningar', icon: 'payments', adminOnly: true },
  { id: 'checkout', label: 'Kassa', icon: 'shopping_cart_checkout', adminOnly: true },
  { id: 'customer-accounts', label: 'Kundkonton', icon: 'manage_accounts', adminOnly: true },
  { id: 'general', label: 'Allmänt', icon: 'storefront' },
  { id: 'apps', label: 'Appar', icon: 'home_storage', adminOnly: true },
  { id: 'integrations', label: 'Integrationer', icon: 'linked_services', adminOnly: true },
  { id: 'domains', label: 'Domäner', icon: 'travel_explore', adminOnly: true },
  { id: 'languages', label: 'Språk', icon: 'translate' },
  { id: 'email', label: 'Aviseringar', icon: 'notifications', adminOnly: true },
  { id: 'policies', label: 'Policyer', icon: 'docs' },
];

/** Returns the visible items for the current role, in declaration order. */
export function visibleSettingsNavItems(isAdmin: boolean): SettingsNavItem[] {
  return SETTINGS_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}

/** First visible item id — used as the default active tab on entry. */
export function getDefaultSettingsTab(isAdmin: boolean): string {
  return visibleSettingsNavItems(isAdmin)[0]?.id ?? 'general';
}
