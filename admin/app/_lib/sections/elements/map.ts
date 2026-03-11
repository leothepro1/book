import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Map element — "Karta".
 *
 * Renders a saved map configuration from tenantConfig.maps.
 * The map is created and configured in the /maps admin page,
 * then selected here via a searchable dropdown.
 *
 * Element settings are minimal:
 *   - map_id: which saved map to display
 *   - map_height: display height in pixels
 *   - map_border_radius: corner rounding
 */
export const mapElement: ElementDefinition = {
  type: "map",
  version: "2.0.0",
  name: "Karta",
  description: "Visa en sparad karta.",
  icon: "map",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "map_id",
      type: "mapPicker",
      label: "Karta",
      default: "",
      description: "Välj en sparad karta. Skapa kartor under Kartor i menyn.",
    },
    {
      key: "map_height",
      type: "range",
      label: "Höjd",
      default: 400,
      min: 200,
      max: 800,
      step: 25,
      unit: "px",
      group: "Visning",
    },
    {
      key: "map_border_radius",
      type: "range",
      label: "Hörnradie",
      default: 12,
      min: 0,
      max: 32,
      step: 2,
      unit: "px",
      group: "Visning",
    },
  ],

  settingDefaults: {
    map_id: "",
    map_height: 400,
    map_border_radius: 12,
  },

  presets: [
    {
      key: "default",
      name: "Karta",
      description: "Visa en sparad karta",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(mapElement);
