import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Gallery element — mosaic image grid with fullscreen showcase modal.
 *
 * Replicates the proven ShowcaseLayout pattern from category cards:
 * - Adaptive mosaic preview (1–4+ images)
 * - Click to open fullscreen modal with all images
 * - Smooth open/close animations
 */
export const galleryElement: ElementDefinition = {
  type: "gallery",
  version: "1.0.0",
  name: "Galleri",
  description: "Bildgalleri med mosaik och fullskärmsvy.",
  icon: "gallery_thumbnail",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "title",
      type: "text",
      label: "Rubrik",
      default: "",
    },
    {
      key: "images",
      type: "imageList",
      label: "Bilder",
      default: [],
      required: true,
    },
    {
      key: "columns",
      type: "select",
      label: "Layout",
      default: "2",
      options: [
        { value: "1", label: "1 bild per rad" },
        { value: "2", label: "2 bilder per rad" },
        { value: "3", label: "3 bilder per rad" },
      ],
    },
    {
      key: "aspectRatio",
      type: "select",
      label: "Bildförhållande",
      default: "1/1",
      options: [
        { value: "1/1", label: "Standard", icon: "crop_square" },
        { value: "5/4", label: "Landskap", icon: "crop_landscape" },
        { value: "2/3", label: "Porträtt", icon: "crop_portrait" },
      ],
    },
    {
      key: "cornerRadius",
      type: "cornerRadius",
      label: "Hörnradie",
      default: 0,
    },
  ],

  settingDefaults: {
    images: [],
    columns: "2",
    aspectRatio: "1/1",
    title: "",
    radiusTopLeft: 16,
    radiusTopRight: 16,
    radiusBottomRight: 16,
    radiusBottomLeft: 16,
  },

  presets: [
    {
      key: "default",
      name: "Galleri",
      description: "Bildgalleri med mosaik",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(galleryElement);
