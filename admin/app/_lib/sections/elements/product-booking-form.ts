import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Booking Form element — datum/gäst-väljare.
 * Compact form med incheckning, utcheckning, gäster.
 * Läser/skriver URL-params. Border runt hela elementet.
 * Product-page scoped.
 */
export const productBookingFormElement: ElementDefinition = {
  type: "product-booking-form",
  version: "1.0.0",
  name: "Bokningsformulär",
  description: "Datum- och gästväljare för bokning.",
  icon: "date_range",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "product",

  settingsSchema: [],
  settingDefaults: {},

  presets: [
    {
      key: "default",
      name: "Bokningsformulär",
      description: "Datum och gäster",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productBookingFormElement);
