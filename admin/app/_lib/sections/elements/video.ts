import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Video element — optimized video playback via Cloudinary.
 *
 * Settings: src (video URL), autoplay toggle, width, height, corner radius.
 * When autoplay is off, shows a play button overlay.
 * Cloudinary handles transcoding, adaptive bitrate, and format negotiation.
 */
export const videoElement: ElementDefinition = {
  type: "video",
  version: "1.0.0",
  name: "Video",
  description: "Videoklipp med optimerad uppspelning.",
  icon: "youtube_activity",
  supportsAction: false,
  skipPresetPicker: true,

  settingsSchema: [
    {
      key: "src",
      type: "video",
      label: "Video",
      default: "",
      required: true,
    },
    {
      key: "autoplay",
      type: "toggle",
      label: "Spela upp automatiskt",
      default: false,
    },
    {
      key: "width",
      type: "range",
      label: "Bredd",
      default: 100,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "height",
      type: "range",
      label: "Höjd",
      default: 300,
      min: 0,
      max: 800,
      step: 1,
      unit: "px",
    },
    {
      key: "cornerRadius",
      type: "cornerRadius",
      label: "Hörnradie",
      default: 0,
    },
  ],

  settingDefaults: {
    src: "",
    autoplay: false,
    width: 100,
    height: 300,
    radiusTopLeft: 0,
    radiusTopRight: 0,
    radiusBottomRight: 0,
    radiusBottomLeft: 0,
  },

  presets: [
    {
      key: "default",
      name: "Video",
      description: "Standard videoelement",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(videoElement);
