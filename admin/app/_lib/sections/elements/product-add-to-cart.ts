import type { ElementDefinition } from "../types";
import { registerElementDefinition } from "../registry";

/**
 * Product Add to Cart element — standard product variant selector + buy button.
 *
 * Contains ALL purchasing logic: option/variant selection, price display,
 * inventory status, and addToCart. Scoped to shop-product pages only —
 * accommodations use the booking sidebar instead.
 */
export const productAddToCartElement: ElementDefinition = {
  type: "product-add-to-cart",
  version: "1.0.0",
  name: "Köpformulär",
  description: "Variantval, pris och lägg-i-varukorg för standardprodukter.",
  icon: "add_shopping_cart",
  supportsAction: false,
  skipPresetPicker: true,
  pageScope: "shop-product",

  settingsSchema: [],
  settingDefaults: {},

  presets: [
    {
      key: "default",
      name: "Köpformulär",
      description: "Variantval med köpknapp",
      thumbnail: "",
      settingOverrides: {},
    },
  ],
};

registerElementDefinition(productAddToCartElement);
