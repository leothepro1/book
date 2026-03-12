import type { MapConfig, MapMarkerConfig } from "@/app/(guest)/_lib/tenant/types";

export type { MapConfig, MapMarkerConfig };

export function createId(): string {
  return `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createMarkerId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const DEFAULT_MAP: Omit<MapConfig, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  style: "light",
  customStyle: "",
  zoom: 14,
  pitch: 0,
  bearing: 0,
  centerLat: 59.3293,
  centerLng: 18.0686,
  buildings3d: false,
  scrollZoom: false,
  navControls: false,
  showPropertyMarker: false,
  showPlaceLabels: true,
  showRoadLabels: true,
  markers: [],
};

export const DEFAULT_MARKER: Omit<MapMarkerConfig, "id"> = {
  lat: 0,
  lng: 0,
  title: "",
  description: "",
  icon: "location_on",
  color: "#E74C3C",
  isActive: true,
  sortOrder: 0,
  showButton: false,
  buttonLabel: "",
  buttonUrl: "",
  buttonOpenNewTab: false,
};

export const STYLE_OPTIONS = [
  { value: "light", label: "Ljus" },
  { value: "dark", label: "Mörk" },
  { value: "streets", label: "Gator" },
  { value: "satellite", label: "Satellit" },
  { value: "outdoors", label: "Utomhus" },
];

export const STYLE_MAP: Record<string, string> = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
};

/** Static thumbnail per map style – used in cards and pickers */
export const STYLE_THUMBNAILS: Record<string, string> = {
  light:
    "https://res.cloudinary.com/dmgmoisae/image/upload/v1773262925/jpeg-optimizer_Gemini_Generated_Image_xfz5l9xfz5l9xfz5_hy6ulf.png",
  dark:
    "https://res.cloudinary.com/dmgmoisae/image/upload/v1773262926/jpeg-optimizer_Gemini_Generated_Image_lo7od3lo7od3lo7o_dvoi3l.png",
  streets:
    "https://res.cloudinary.com/dmgmoisae/image/upload/v1773262924/jpeg-optimizer_Gemini_Generated_Image_5ad1115ad1115ad1_hrtct9.png",
  satellite:
    "https://res.cloudinary.com/dmgmoisae/image/upload/v1773262924/jpeg-optimizer_Gemini_Generated_Image_ywbvqcywbvqcywbv_rq66uc.png",
  outdoors:
    "https://res.cloudinary.com/dmgmoisae/image/upload/v1773262986/jpeg-optimizer_Gemini_Generated_Image_147w5147w5147w51_lsngdz.png",
};

/** Resolve the thumbnail URL for a given map style key */
export function getMapThumbnail(style: string): string {
  return STYLE_THUMBNAILS[style] ?? STYLE_THUMBNAILS.light;
}

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
