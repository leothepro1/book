/**
 * Facility Map — Swedish display labels and category grouping.
 *
 * Used by UI only — never by sync or business logic.
 * Every FacilityType enum value must have an entry here.
 */

import type { FacilityType } from "@prisma/client";

export type FacilityCategory =
  | "CLIMATE"
  | "BATHROOM"
  | "KITCHEN"
  | "MEDIA_TECH"
  | "BEDROOM_LIVING"
  | "OUTDOOR_VIEW"
  | "ACCESS_POLICY"
  | "SERVICES";

export const FACILITY_CATEGORY_LABELS: Record<FacilityCategory, string> = {
  CLIMATE: "Klimat",
  BATHROOM: "Badrum",
  KITCHEN: "Mat & dryck",
  MEDIA_TECH: "Media & teknik",
  BEDROOM_LIVING: "Boende",
  OUTDOOR_VIEW: "Utomhus & utsikt",
  ACCESS_POLICY: "Tillgänglighet & regler",
  SERVICES: "Tjänster",
};

type FacilityMeta = {
  label: string;
  category: FacilityCategory;
};

export const FACILITY_MAP: Record<FacilityType, FacilityMeta> = {
  // Climate
  AIR_CONDITIONING: { label: "Luftkonditionering", category: "CLIMATE" },
  HEATING: { label: "Uppvärmning", category: "CLIMATE" },
  FAN: { label: "Fläkt", category: "CLIMATE" },
  FIREPLACE: { label: "Braskamin", category: "CLIMATE" },

  // Bathroom
  BATHTUB: { label: "Badkar", category: "BATHROOM" },
  SHOWER: { label: "Dusch", category: "BATHROOM" },
  SAUNA: { label: "Bastu", category: "BATHROOM" },
  HOT_TUB: { label: "Bubbelbad", category: "BATHROOM" },
  HAIRDRYER: { label: "Hårtork", category: "BATHROOM" },
  BATHROBES: { label: "Badrockar", category: "BATHROOM" },
  SLIPPERS: { label: "Tofflor", category: "BATHROOM" },
  FREE_TOILETRIES: { label: "Gratis toalettartiklar", category: "BATHROOM" },
  BIDET: { label: "Bidé", category: "BATHROOM" },
  WC: { label: "WC", category: "BATHROOM" },

  // Kitchen
  KITCHEN: { label: "Kök", category: "KITCHEN" },
  KITCHENETTE: { label: "Pentry", category: "KITCHEN" },
  REFRIGERATOR: { label: "Kylskåp", category: "KITCHEN" },
  FREEZER: { label: "Frys", category: "KITCHEN" },
  MICROWAVE: { label: "Mikrovågsugn", category: "KITCHEN" },
  OVEN: { label: "Ugn", category: "KITCHEN" },
  STOVE: { label: "Spis", category: "KITCHEN" },
  DISHWASHER: { label: "Diskmaskin", category: "KITCHEN" },
  KETTLE: { label: "Vattenkokare", category: "KITCHEN" },
  COFFEE_MAKER: { label: "Kaffe/Te-bryggare", category: "KITCHEN" },
  TOASTER: { label: "Brödrost", category: "KITCHEN" },
  COOKWARE: { label: "Köksredskap", category: "KITCHEN" },
  MINIBAR: { label: "Minibar", category: "KITCHEN" },

  // Media & Tech
  WIFI: { label: "Gratis WiFi", category: "MEDIA_TECH" },
  FIBER: { label: "Fiber", category: "MEDIA_TECH" },
  TV: { label: "TV", category: "MEDIA_TECH" },
  FLAT_SCREEN_TV: { label: "Platt-TV", category: "MEDIA_TECH" },
  CABLE_TV: { label: "Kabel-TV", category: "MEDIA_TECH" },
  SATELLITE_TV: { label: "Satellit-TV", category: "MEDIA_TECH" },
  PAY_TV: { label: "Betal-TV", category: "MEDIA_TECH" },
  BLUETOOTH_SPEAKER: { label: "Bluetooth-högtalare", category: "MEDIA_TECH" },
  APPLE_TV: { label: "Apple TV", category: "MEDIA_TECH" },
  CHROMECAST: { label: "Chromecast", category: "MEDIA_TECH" },
  DVD_PLAYER: { label: "DVD-spelare", category: "MEDIA_TECH" },
  CD_PLAYER: { label: "CD-spelare", category: "MEDIA_TECH" },
  GAME_CONSOLE: { label: "Spelkonsol", category: "MEDIA_TECH" },
  LAPTOP_STORAGE: { label: "Förvaringsbox för laptop", category: "MEDIA_TECH" },

  // Bedroom & Living
  WARDROBE: { label: "Garderob", category: "BEDROOM_LIVING" },
  SOFA: { label: "Soffa", category: "BEDROOM_LIVING" },
  SOFA_BED_LIVING: { label: "Bäddsoffa", category: "BEDROOM_LIVING" },
  DESK: { label: "Skrivbord", category: "BEDROOM_LIVING" },
  IRONING_BOARD: { label: "Strykbräda", category: "BEDROOM_LIVING" },
  IRON: { label: "Strykjärn", category: "BEDROOM_LIVING" },
  TROUSER_PRESS: { label: "Byxpress", category: "BEDROOM_LIVING" },
  WASHER: { label: "Tvättmaskin", category: "BEDROOM_LIVING" },
  DRYER: { label: "Torktumlare", category: "BEDROOM_LIVING" },
  DRYING_CABINET: { label: "Torkskåp", category: "BEDROOM_LIVING" },
  STEAMER: { label: "Steamer", category: "BEDROOM_LIVING" },
  DUMBBELL: { label: "Hantlar", category: "BEDROOM_LIVING" },

  // Outdoor & View
  BALCONY: { label: "Balkong", category: "OUTDOOR_VIEW" },
  TERRACE: { label: "Terrass", category: "OUTDOOR_VIEW" },
  PATIO: { label: "Uteplats", category: "OUTDOOR_VIEW" },
  PRIVATE_POOL: { label: "Egen pool", category: "OUTDOOR_VIEW" },
  GARDEN_VIEW: { label: "Utsikt över trädgård", category: "OUTDOOR_VIEW" },
  POOL_VIEW: { label: "Utsikt över poolområde", category: "OUTDOOR_VIEW" },
  SEA_VIEW: { label: "Havsutsikt", category: "OUTDOOR_VIEW" },
  LAKE_VIEW: { label: "Sjöutsikt", category: "OUTDOOR_VIEW" },
  MOUNTAIN_VIEW: { label: "Utsikt mot berg", category: "OUTDOOR_VIEW" },
  CITY_VIEW: { label: "Utsikt över staden", category: "OUTDOOR_VIEW" },
  CANAL_VIEW: { label: "Utsikt över kanalen", category: "OUTDOOR_VIEW" },
  RIVER_VIEW: { label: "Älvutsikt", category: "OUTDOOR_VIEW" },
  FJORD_VIEW: { label: "Fjordutsikt", category: "OUTDOOR_VIEW" },

  // Access & Policy
  PRIVATE_ENTRANCE: { label: "Egen entré", category: "ACCESS_POLICY" },
  STORAGE_BOX: { label: "Förvaringsbox", category: "ACCESS_POLICY" },
  PETS_ALLOWED: { label: "Husdjur tillåtna", category: "ACCESS_POLICY" },
  PETS_NOT_ALLOWED: { label: "Husdjur ej tillåtna", category: "ACCESS_POLICY" },
  NO_SMOKING: { label: "Rökning förbjudet", category: "ACCESS_POLICY" },
  SOUNDPROOFED: { label: "Ljudisolerad", category: "ACCESS_POLICY" },
  WHEELCHAIR_ACCESSIBLE: { label: "Tillgänglighetsanpassat", category: "ACCESS_POLICY" },
  EV_CHARGER: { label: "Elbilsladdare", category: "ACCESS_POLICY" },
  SKI_STORAGE: { label: "Skiförvaring", category: "ACCESS_POLICY" },
  MOTOR_HEATER: { label: "Motorvärmare", category: "ACCESS_POLICY" },

  // Services
  WAKE_UP_SERVICE: { label: "Väckningsservice", category: "SERVICES" },
  ALARM_CLOCK: { label: "Väckarklocka", category: "SERVICES" },
  LATE_CHECKOUT: { label: "Sen utcheckning", category: "SERVICES" },
  DEPARTURE_CLEANING: { label: "Avresestädning", category: "SERVICES" },
};

/** Returns all visible facilities grouped by category, sorted by label within each group. */
export function groupFacilitiesByCategory(
  facilities: Array<{ facilityType: FacilityType; isVisible: boolean }>,
): Array<{
  category: FacilityCategory;
  label: string;
  facilities: FacilityMeta[];
}> {
  const visible = facilities.filter((f) => f.isVisible);

  const grouped = new Map<FacilityCategory, FacilityMeta[]>();

  for (const f of visible) {
    const meta = FACILITY_MAP[f.facilityType];
    if (!meta) continue;
    const existing = grouped.get(meta.category) ?? [];
    existing.push(meta);
    grouped.set(meta.category, existing);
  }

  return Array.from(grouped.entries())
    .map(([category, facs]) => ({
      category,
      label: FACILITY_CATEGORY_LABELS[category],
      facilities: facs.sort((a, b) => a.label.localeCompare(b.label, "sv")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "sv"));
}
