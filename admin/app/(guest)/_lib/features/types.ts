export type FeatureFlags = {
  // Footer / moduler
  commerceEnabled: boolean;
  accountEnabled: boolean;

  // Header (globala UI-actions)
  notificationsEnabled: boolean;
  languageSwitcherEnabled: boolean;

  /**
   * Controls whether login/account links are shown in the storefront
   * header and checkout. Sourced from `Tenant.showLoginLinks` (direct
   * column, immediate effect — not part of the draft/publish flow).
   * Merchants toggle this from settings → Kundkonton.
   */
  showLoginLinks: boolean;
};
