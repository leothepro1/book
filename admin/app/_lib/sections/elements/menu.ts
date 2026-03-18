import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Menu element — "Meny".
 *
 * Renders a navigation menu from tenantConfig.menus.
 * The menu is created and configured in the /menus admin page,
 * then selected here via a searchable dropdown.
 *
 * Element settings are minimal:
 *   - menu_id: which saved menu to display
 */
export const menuElement: ElementDefinition = {
  type: "menu",
  version: "1.0.0",
  name: "Meny",
  description: "Visa en sparad navigeringsmeny.",
  icon: "link",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "menu_id",
      type: "menuPicker",
      label: "Meny",
      default: "",
      description: "Välj en sparad meny. Skapa menyer under Menyer.",
    },
  ],

  settingDefaults: {
    menu_id: "",
  },

  presets: [
    {
      key: "default",
      name: "Meny",
      description: "Visa en sparad meny",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(menuElement);
