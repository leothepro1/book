"use client";

/**
 * Accommodation Facilities element.
 * 2-col grid (max 10), then "Visa alla X bekvämligheter" → categorized modal.
 * Every facility has a predetermined Material Symbols icon.
 */

import { useState, useCallback, useEffect } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import "./accommodation-facilities-element.css";

// ── Icon mapping: FacilityType → Material Symbols Rounded ──

const FACILITY_ICONS: Record<string, string> = {
  // Climate
  AIR_CONDITIONING: "ac_unit",
  HEATING: "device_thermostat",
  FAN: "mode_fan",
  FIREPLACE: "fireplace",
  // Bathroom
  BATHTUB: "bathtub",
  SHOWER: "shower",
  SAUNA: "hot_tub",
  HOT_TUB: "hot_tub",
  HAIRDRYER: "air",
  BATHROBES: "checkroom",
  SLIPPERS: "footprint",
  FREE_TOILETRIES: "soap",
  BIDET: "wash",
  WC: "wc",
  // Kitchen
  KITCHEN: "kitchen",
  KITCHENETTE: "countertops",
  REFRIGERATOR: "kitchen",
  FREEZER: "ac_unit",
  MICROWAVE: "microwave",
  OVEN: "oven_gen",
  STOVE: "skillet",
  DISHWASHER: "dishwasher_gen",
  KETTLE: "kettle",
  COFFEE_MAKER: "coffee_maker",
  TOASTER: "breakfast_dining",
  COOKWARE: "skillet",
  MINIBAR: "local_bar",
  // Media & Tech
  WIFI: "wifi",
  FIBER: "lan",
  TV: "tv",
  FLAT_SCREEN_TV: "tv",
  CABLE_TV: "live_tv",
  SATELLITE_TV: "satellite_alt",
  PAY_TV: "live_tv",
  BLUETOOTH_SPEAKER: "speaker",
  APPLE_TV: "tv",
  CHROMECAST: "cast",
  DVD_PLAYER: "album",
  CD_PLAYER: "album",
  GAME_CONSOLE: "sports_esports",
  LAPTOP_STORAGE: "laptop",
  // Bedroom & Living
  WARDROBE: "checkroom",
  SOFA: "weekend",
  SOFA_BED_LIVING: "weekend",
  DESK: "desk",
  IRONING_BOARD: "iron",
  IRON: "iron",
  TROUSER_PRESS: "iron",
  WASHER: "local_laundry_service",
  DRYER: "local_laundry_service",
  DRYING_CABINET: "local_laundry_service",
  STEAMER: "iron",
  DUMBBELL: "fitness_center",
  // Outdoor & View
  BALCONY: "balcony",
  TERRACE: "deck",
  PATIO: "yard",
  PRIVATE_POOL: "pool",
  GARDEN_VIEW: "park",
  POOL_VIEW: "pool",
  SEA_VIEW: "waves",
  LAKE_VIEW: "water",
  MOUNTAIN_VIEW: "landscape",
  CITY_VIEW: "location_city",
  CANAL_VIEW: "water",
  RIVER_VIEW: "water",
  FJORD_VIEW: "water",
  // Access & Policy
  PRIVATE_ENTRANCE: "door_front",
  STORAGE_BOX: "inventory_2",
  PETS_ALLOWED: "pets",
  PETS_NOT_ALLOWED: "block",
  NO_SMOKING: "smoke_free",
  SOUNDPROOFED: "volume_off",
  WHEELCHAIR_ACCESSIBLE: "accessible",
  EV_CHARGER: "ev_station",
  SKI_STORAGE: "downhill_skiing",
  MOTOR_HEATER: "local_parking",
  // Services
  WAKE_UP_SERVICE: "alarm",
  ALARM_CLOCK: "alarm",
  LATE_CHECKOUT: "schedule",
  DEPARTURE_CLEANING: "cleaning_services",
};

// ── Labels ──

const FACILITY_LABELS: Record<string, string> = {
  AIR_CONDITIONING: "Luftkonditionering", HEATING: "Uppvärmning", FAN: "Fläkt", FIREPLACE: "Braskamin",
  BATHTUB: "Badkar", SHOWER: "Dusch", SAUNA: "Bastu", HOT_TUB: "Bubbelbad", HAIRDRYER: "Hårtork",
  BATHROBES: "Badrockar", SLIPPERS: "Tofflor", FREE_TOILETRIES: "Gratis toalettartiklar", BIDET: "Bidé", WC: "WC",
  KITCHEN: "Kök", KITCHENETTE: "Pentry", REFRIGERATOR: "Kylskåp", FREEZER: "Frys", MICROWAVE: "Mikrovågsugn",
  OVEN: "Ugn", STOVE: "Spis", DISHWASHER: "Diskmaskin", KETTLE: "Vattenkokare", COFFEE_MAKER: "Kaffe/Te-bryggare",
  TOASTER: "Brödrost", COOKWARE: "Köksredskap", MINIBAR: "Minibar",
  WIFI: "Gratis WiFi", FIBER: "Fiber", TV: "TV", FLAT_SCREEN_TV: "Platt-TV", CABLE_TV: "Kabel-TV",
  SATELLITE_TV: "Satellit-TV", PAY_TV: "Betal-TV", BLUETOOTH_SPEAKER: "Bluetooth-högtalare", APPLE_TV: "Apple TV",
  CHROMECAST: "Chromecast", DVD_PLAYER: "DVD-spelare", CD_PLAYER: "CD-spelare", GAME_CONSOLE: "Spelkonsol",
  LAPTOP_STORAGE: "Förvaringsbox för laptop",
  WARDROBE: "Garderob", SOFA: "Soffa", SOFA_BED_LIVING: "Bäddsoffa", DESK: "Skrivbord",
  IRONING_BOARD: "Strykbräda", IRON: "Strykjärn", TROUSER_PRESS: "Byxpress", WASHER: "Tvättmaskin",
  DRYER: "Torktumlare", DRYING_CABINET: "Torkskåp", STEAMER: "Steamer", DUMBBELL: "Hantlar",
  BALCONY: "Balkong", TERRACE: "Terrass", PATIO: "Uteplats", PRIVATE_POOL: "Egen pool",
  GARDEN_VIEW: "Utsikt över trädgård", POOL_VIEW: "Utsikt över poolområde", SEA_VIEW: "Havsutsikt",
  LAKE_VIEW: "Sjöutsikt", MOUNTAIN_VIEW: "Utsikt mot berg", CITY_VIEW: "Utsikt över staden",
  CANAL_VIEW: "Utsikt över kanalen", RIVER_VIEW: "Älvutsikt", FJORD_VIEW: "Fjordutsikt",
  PRIVATE_ENTRANCE: "Egen entré", STORAGE_BOX: "Förvaringsbox", PETS_ALLOWED: "Husdjur tillåtna",
  PETS_NOT_ALLOWED: "Husdjur ej tillåtna", NO_SMOKING: "Rökning förbjudet", SOUNDPROOFED: "Ljudisolerad",
  WHEELCHAIR_ACCESSIBLE: "Tillgänglighetsanpassat", EV_CHARGER: "Elbilsladdare", SKI_STORAGE: "Skiförvaring",
  MOTOR_HEATER: "Motorvärmare",
  WAKE_UP_SERVICE: "Väckningsservice", ALARM_CLOCK: "Väckarklocka", LATE_CHECKOUT: "Sen utcheckning",
  DEPARTURE_CLEANING: "Avresestädning",
};

// ── Categories ──

const CATEGORY_LABELS: Record<string, string> = {
  CLIMATE: "Klimat", BATHROOM: "Badrum", KITCHEN: "Mat & dryck", MEDIA_TECH: "Media & teknik",
  BEDROOM_LIVING: "Boende", OUTDOOR_VIEW: "Utomhus & utsikt", ACCESS_POLICY: "Tillgänglighet & regler",
  SERVICES: "Tjänster",
};

const FACILITY_CATEGORIES: Record<string, string> = {
  AIR_CONDITIONING: "CLIMATE", HEATING: "CLIMATE", FAN: "CLIMATE", FIREPLACE: "CLIMATE",
  BATHTUB: "BATHROOM", SHOWER: "BATHROOM", SAUNA: "BATHROOM", HOT_TUB: "BATHROOM", HAIRDRYER: "BATHROOM",
  BATHROBES: "BATHROOM", SLIPPERS: "BATHROOM", FREE_TOILETRIES: "BATHROOM", BIDET: "BATHROOM", WC: "BATHROOM",
  KITCHEN: "KITCHEN", KITCHENETTE: "KITCHEN", REFRIGERATOR: "KITCHEN", FREEZER: "KITCHEN", MICROWAVE: "KITCHEN",
  OVEN: "KITCHEN", STOVE: "KITCHEN", DISHWASHER: "KITCHEN", KETTLE: "KITCHEN", COFFEE_MAKER: "KITCHEN",
  TOASTER: "KITCHEN", COOKWARE: "KITCHEN", MINIBAR: "KITCHEN",
  WIFI: "MEDIA_TECH", FIBER: "MEDIA_TECH", TV: "MEDIA_TECH", FLAT_SCREEN_TV: "MEDIA_TECH", CABLE_TV: "MEDIA_TECH",
  SATELLITE_TV: "MEDIA_TECH", PAY_TV: "MEDIA_TECH", BLUETOOTH_SPEAKER: "MEDIA_TECH", APPLE_TV: "MEDIA_TECH",
  CHROMECAST: "MEDIA_TECH", DVD_PLAYER: "MEDIA_TECH", CD_PLAYER: "MEDIA_TECH", GAME_CONSOLE: "MEDIA_TECH",
  LAPTOP_STORAGE: "MEDIA_TECH",
  WARDROBE: "BEDROOM_LIVING", SOFA: "BEDROOM_LIVING", SOFA_BED_LIVING: "BEDROOM_LIVING", DESK: "BEDROOM_LIVING",
  IRONING_BOARD: "BEDROOM_LIVING", IRON: "BEDROOM_LIVING", TROUSER_PRESS: "BEDROOM_LIVING", WASHER: "BEDROOM_LIVING",
  DRYER: "BEDROOM_LIVING", DRYING_CABINET: "BEDROOM_LIVING", STEAMER: "BEDROOM_LIVING", DUMBBELL: "BEDROOM_LIVING",
  BALCONY: "OUTDOOR_VIEW", TERRACE: "OUTDOOR_VIEW", PATIO: "OUTDOOR_VIEW", PRIVATE_POOL: "OUTDOOR_VIEW",
  GARDEN_VIEW: "OUTDOOR_VIEW", POOL_VIEW: "OUTDOOR_VIEW", SEA_VIEW: "OUTDOOR_VIEW", LAKE_VIEW: "OUTDOOR_VIEW",
  MOUNTAIN_VIEW: "OUTDOOR_VIEW", CITY_VIEW: "OUTDOOR_VIEW", CANAL_VIEW: "OUTDOOR_VIEW", RIVER_VIEW: "OUTDOOR_VIEW",
  FJORD_VIEW: "OUTDOOR_VIEW",
  PRIVATE_ENTRANCE: "ACCESS_POLICY", STORAGE_BOX: "ACCESS_POLICY", PETS_ALLOWED: "ACCESS_POLICY",
  PETS_NOT_ALLOWED: "ACCESS_POLICY", NO_SMOKING: "ACCESS_POLICY", SOUNDPROOFED: "ACCESS_POLICY",
  WHEELCHAIR_ACCESSIBLE: "ACCESS_POLICY", EV_CHARGER: "ACCESS_POLICY", SKI_STORAGE: "ACCESS_POLICY",
  MOTOR_HEATER: "ACCESS_POLICY",
  WAKE_UP_SERVICE: "SERVICES", ALARM_CLOCK: "SERVICES", LATE_CHECKOUT: "SERVICES", DEPARTURE_CLEANING: "SERVICES",
};

const CATEGORY_ORDER = ["CLIMATE", "BATHROOM", "KITCHEN", "MEDIA_TECH", "BEDROOM_LIVING", "OUTDOOR_VIEW", "ACCESS_POLICY", "SERVICES"];

function groupByCategory(facilities: string[]) {
  const groups = new Map<string, string[]>();
  for (const f of facilities) {
    const cat = FACILITY_CATEGORIES[f] ?? "OTHER";
    const list = groups.get(cat) ?? [];
    list.push(f);
    groups.set(cat, list);
  }
  return CATEGORY_ORDER
    .filter((cat) => groups.has(cat))
    .map((cat) => ({ category: cat, label: CATEGORY_LABELS[cat] ?? cat, items: groups.get(cat)! }));
}

// ── Modal ──

function FacilitiesModal({ facilities, onClose }: { facilities: string[]; onClose: () => void }) {
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [close]);

  const grouped = groupByCategory(facilities);

  return (
    <div className={`af-modal-overlay${closing ? " af-modal-overlay--closing" : ""}`} onClick={close}>
      <div className="af-modal" onClick={(e) => e.stopPropagation()}>
        <div className="af-modal__header">
          <h2 className="af-modal__title">Bekvämligheter</h2>
          <button className="af-modal__close" onClick={close} aria-label="Stäng">
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div className="af-modal__body">
          {grouped.map((group) => (
            <div key={group.category} className="af-modal__group">
              <h3 className="af-modal__group-title">{group.label}</h3>
              <div className="af-modal__group-list">
                {group.items.map((f) => (
                  <div key={f} className="af-modal__item">
                    <span className="material-symbols-rounded af-modal__item-icon">
                      {FACILITY_ICONS[f] ?? "check_circle"}
                    </span>
                    <span className="af-modal__item-label">{FACILITY_LABELS[f] ?? f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Element ──

export function AccommodationFacilitiesElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const [modalOpen, setModalOpen] = useState(false);
  const facilities: string[] = product?.facilities ?? [];

  if (facilities.length === 0) {
    return (
      <div style={{ fontSize: "0.8125rem", color: "color-mix(in srgb, var(--text, #000) 40%, transparent)" }}>
        Inga bekvämligheter
      </div>
    );
  }

  const preview = facilities.slice(0, 10);
  const remaining = facilities.length - preview.length;

  return (
    <>
      <div className="af-grid">
        {preview.map((f) => (
          <div key={f} className="af-grid__item">
            <span className="material-symbols-rounded af-grid__icon">
              {FACILITY_ICONS[f] ?? "check_circle"}
            </span>
            <span className="af-grid__label">{FACILITY_LABELS[f] ?? f}</span>
          </div>
        ))}
      </div>
      {facilities.length > 10 && (
        <button type="button" className="af-show-all" onClick={() => setModalOpen(true)}>
          Visa alla {facilities.length} bekvämligheter
        </button>
      )}
      {modalOpen && (
        <FacilitiesModal facilities={facilities} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
