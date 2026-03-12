"use client";

/**
 * MapElement — Renders a saved map configuration.
 *
 * Looks up the map by `map_id` from tenantConfig.maps[],
 * then renders an interactive Mapbox GL map with the saved
 * style, camera, markers, and feature toggles.
 *
 * Click opens a MorphModal with the map in full-screen.
 *
 * Element-level settings control only display: height and border radius.
 * All map configuration lives in the MapConfig (managed in /maps admin page).
 */

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import type { MapConfig, MapMarkerConfig } from "@/app/(guest)/_lib/tenant/types";
import {
  isCloudinaryUrl,
  extractPublicId,
  buildCloudinaryUrl,
} from "@/app/_lib/cloudinary/client";
import { useMaps } from "./MapsContext";
import { MapMorphModal } from "./MapMorphModal";

// ─── Style Map ───────────────────────────────────────────────

const STYLE_MAP: Record<string, string> = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ─── Singleton Mapbox Loader ─────────────────────────────────

let mapboxPromise: Promise<typeof import("mapbox-gl")> | null = null;

function loadMapbox(): Promise<typeof import("mapbox-gl")> {
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl").then((m) => {
      m.default.accessToken = MAPBOX_TOKEN;
      return m;
    });
  }
  return mapboxPromise;
}

// ─── Component ───────────────────────────────────────────────

export function MapElement({ resolved }: { resolved: ResolvedElement }) {
  const maps = useMaps();
  const { settings } = resolved;

  // Element-level settings (display)
  const mapId = (settings.map_id as string) || "";
  const height = (settings.map_height as number) ?? 400;
  const borderRadius = (settings.map_border_radius as number) ?? 12;

  // Resolve map config
  const mapConfig = useMemo(() => {
    if (!maps || !mapId) return null;
    return maps.find((m) => m.id === mapId) ?? null;
  }, [maps, mapId]);

  // No map selected
  if (!mapId) {
    return (
      <div
        style={{
          height,
          borderRadius,
          background: "#F0EFED",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8C8B89",
          fontSize: 14,
          gap: 8,
        }}
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: 20 }}
          aria-hidden="true"
        >
          map
        </span>
        Ingen karta vald
      </div>
    );
  }

  // Map not found
  if (!mapConfig) {
    return (
      <div
        style={{
          height,
          borderRadius,
          background: "#F0EFED",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8C8B89",
          fontSize: 14,
        }}
      >
        Kartan hittades inte
      </div>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div
        style={{
          height,
          borderRadius,
          background: "#F0EFED",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8C8B89",
          fontSize: 14,
        }}
      >
        Mapbox-token saknas
      </div>
    );
  }

  return (
    <MapMorphModal
      title={mapConfig.name || "Karta"}
      cardContent={
        <MapCanvas
          mapConfig={mapConfig}
          height={height}
          borderRadius={borderRadius}
        />
      }
      modalContent={
        <MapModalBody mapConfig={mapConfig} />
      }
    />
  );
}

// ─── Card-level Map (static preview on the page) ─────────────

export function MapCanvas({
  mapConfig,
  height,
  borderRadius,
}: {
  mapConfig: MapConfig;
  height: number | string;
  borderRadius: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const poiLayersRef = useRef<string[]>([]);
  const roadLayersRef = useRef<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const styleName = mapConfig.style || "light";
  const customStyle = mapConfig.customStyle || "";
  const zoom = mapConfig.zoom ?? 14;
  const pitch = mapConfig.pitch ?? 0;
  const bearing = mapConfig.bearing ?? 0;
  const buildings3d = mapConfig.buildings3d ?? false;
  const scrollZoom = mapConfig.scrollZoom ?? false;
  const showPlaceLabels = mapConfig.showPlaceLabels ?? true;
  const showRoadLabels = mapConfig.showRoadLabels ?? true;
  const markers = mapConfig.markers ?? [];

  const styleUrl =
    styleName === "custom" && customStyle
      ? customStyle
      : STYLE_MAP[styleName] || STYLE_MAP.light;

  const activeMarkers = useMemo(
    () => markers.filter((m) => m.isActive !== false && m.lat && m.lng && (m.title?.trim() || m.icon?.trim())),
    [markers]
  );

  const center = useMemo((): [number, number] => {
    if (mapConfig.centerLat && mapConfig.centerLng) {
      return [mapConfig.centerLng, mapConfig.centerLat];
    }
    if (activeMarkers.length > 0) {
      return [activeMarkers[0].lng, activeMarkers[0].lat];
    }
    return [18.0686, 59.3293];
  }, [mapConfig.centerLat, mapConfig.centerLng, activeMarkers]);

  // ── Initialize map ──
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    let cancelled = false;

    loadMapbox().then((mapboxgl) => {
      if (cancelled || !containerRef.current) return;

      const map = new mapboxgl.default.Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom,
        pitch,
        bearing,
        scrollZoom: false,
        interactive: false,
        attributionControl: false,
      });

      map.addControl(
        new mapboxgl.default.AttributionControl({ compact: true }),
        "bottom-left"
      );

      map.on("style.load", () => {
        const layers = map.getStyle().layers ?? [];
        poiLayersRef.current = layers.filter((l) => l.id.includes("poi") && l.type === "symbol").map((l) => l.id);
        roadLayersRef.current = layers.filter((l) => l.id.includes("road") && l.type === "symbol").map((l) => l.id);

        if (buildings3d) add3dBuildings(map);

        // Apply label toggles
        if (!showPlaceLabels) {
          for (const id of poiLayersRef.current) map.setLayoutProperty(id, "visibility", "none");
        }
        if (!showRoadLabels) {
          for (const id of roadLayersRef.current) map.setLayoutProperty(id, "visibility", "none");
        }

        setLoaded(true);
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl, mapConfig.id]);

  // ── Render markers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    loadMapbox().then((mapboxgl) => {
      for (const m of activeMarkers) {
        const el = createMarkerElement(m.title, m.icon, m.color);
        const marker = new mapboxgl.default.Marker({
          element: el,
          anchor: "bottom",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        }).setLngLat([m.lng, m.lat]);

        marker.addTo(map);
        markersRef.current.push(marker);
      }
    });
  }, [loaded, activeMarkers]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height, borderRadius, overflow: "hidden" }}
    />
  );
}

// ─── Modal Body (full-screen interactive map + marker sheets) ─

export function MapModalBody({ mapConfig }: { mapConfig: MapConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const roRef = useRef<ResizeObserver | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Store marker ID instead of full object so sheet content updates live
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  const styleName = mapConfig.style || "light";
  const customStyle = mapConfig.customStyle || "";
  const zoom = mapConfig.zoom ?? 14;
  const pitch = mapConfig.pitch ?? 0;
  const bearing = mapConfig.bearing ?? 0;
  const buildings3d = mapConfig.buildings3d ?? false;
  const showPlaceLabels = mapConfig.showPlaceLabels ?? true;
  const showRoadLabels = mapConfig.showRoadLabels ?? true;
  const markers = mapConfig.markers ?? [];

  const styleUrl =
    styleName === "custom" && customStyle
      ? customStyle
      : STYLE_MAP[styleName] || STYLE_MAP.light;

  const activeMarkers = useMemo(
    () => markers.filter((m) => m.isActive !== false && m.lat && m.lng && (m.title?.trim() || m.icon?.trim())),
    [markers]
  );

  // Resolve the active sheet marker from current data (live updates)
  const activeSheetMarker = useMemo(
    () => activeSheetId ? markers.find((m) => m.id === activeSheetId) ?? null : null,
    [activeSheetId, markers]
  );

  const center = useMemo((): [number, number] => {
    if (mapConfig.centerLat && mapConfig.centerLng) {
      return [mapConfig.centerLng, mapConfig.centerLat];
    }
    if (activeMarkers.length > 0) {
      return [activeMarkers[0].lng, activeMarkers[0].lat];
    }
    return [18.0686, 59.3293];
  }, [mapConfig.centerLat, mapConfig.centerLng, activeMarkers]);

  // Stable ref for marker click callback (avoids re-rendering markers on sheet change)
  const onMarkerClickRef = useRef<(id: string) => void>(() => {});
  onMarkerClickRef.current = (id: string) => setActiveSheetId(id);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    let cancelled = false;

    loadMapbox().then((mapboxgl) => {
      if (cancelled || !containerRef.current) return;

      const map = new mapboxgl.default.Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom,
        pitch,
        bearing,
        scrollZoom: true,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.default.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new mapboxgl.default.AttributionControl({ compact: true }), "bottom-left");

      map.on("style.load", () => {
        if (buildings3d) add3dBuildings(map);

        const layers = map.getStyle().layers ?? [];
        if (!showPlaceLabels) {
          for (const l of layers) {
            if (l.id.includes("poi") && l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none");
          }
        }
        if (!showRoadLabels) {
          for (const l of layers) {
            if (l.id.includes("road") && l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none");
          }
        }
        setLoaded(true);
      });

      mapRef.current = map;

      roRef.current = new ResizeObserver(() => map.resize());
      roRef.current.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl, mapConfig.id]);

  // ── Render markers with click handlers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    loadMapbox().then((mapboxgl) => {
      for (const m of activeMarkers) {
        const el = createMarkerElement(m.title, m.icon, m.color);

        // Click opens the marker sheet
        const hasContent = !!(m.content?.trim());
        const hasCta = !!(m.showButton && m.buttonLabel?.trim());
        if (hasContent || hasCta) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onMarkerClickRef.current(m.id);
          });
        }

        const marker = new mapboxgl.default.Marker({
          element: el,
          anchor: "bottom",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        }).setLngLat([m.lng, m.lat]);

        marker.addTo(map);
        markersRef.current.push(marker);
      }
    });
  }, [loaded, activeMarkers]);

  const handleCloseSheet = useCallback(() => setActiveSheetId(null), []);

  return (
    <>
      <div ref={containerRef} className="map-modal-canvas" />
      <MarkerSheet marker={activeSheetMarker} onClose={handleCloseSheet} />
    </>
  );
}

// ─── Cloudinary-optimized Rich Text HTML ─────────────────────

/** Replace Cloudinary img src URLs with optimized transforms (auto format/quality, capped width). */
function optimizeRichTextImages(html: string): string {
  return html.replace(
    /<img\s([^>]*?)src="([^"]+)"([^>]*?)\/?\s*>/g,
    (_match, before, src, after) => {
      if (isCloudinaryUrl(src)) {
        const publicId = extractPublicId(src);
        const optimized = buildCloudinaryUrl(publicId, {
          width: 800,
          crop: "fit",
          quality: "auto",
          format: "auto",
        });
        return `<img ${before}src="${optimized}"${after} />`;
      }
      return `<img ${before}src="${src}"${after} />`;
    }
  );
}

// ─── Marker Bottom Sheet ─────────────────────────────────────

function MarkerSheet({
  marker,
  onClose,
}: {
  marker: MapMarkerConfig | null;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // Mount → slide in, or unmount → slide out
  useEffect(() => {
    if (marker) {
      setRendered(true);
      // Trigger slide-in on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [marker]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const finishClose = useCallback(() => {
    clearTimeout(closeTimerRef.current);
    onClose();
    setRendered(false);
  }, [onClose]);

  const handleClose = useCallback(() => {
    setVisible(false);
    // Fallback: if transitionEnd never fires (interrupted animation), force cleanup
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(finishClose, 450);
  }, [finishClose]);

  const handleTransitionEndSheet = useCallback(() => {
    if (!visible) finishClose();
  }, [visible, finishClose]);

  if (!rendered || !marker) return null;

  const hasContent = !!(marker.content?.trim());
  const hasCta = !!(marker.showButton && marker.buttonLabel?.trim());

  return (
    <>
      {/* Backdrop */}
      <div
        className="marker-sheet__backdrop"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={`marker-sheet${visible ? " marker-sheet--open" : ""}`}
        onTransitionEnd={handleTransitionEndSheet}
      >
        {/* Close button */}
        <button
          type="button"
          className="marker-sheet__close"
          onClick={handleClose}
          aria-label="Stäng"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
          </svg>
        </button>

        {/* Content */}
        <div className="marker-sheet__content">
          {hasContent && (
            <div
              className="marker-sheet__richtext"
              dangerouslySetInnerHTML={{ __html: optimizeRichTextImages(marker.content!) }}
            />
          )}

          {hasCta && (
            <a
              href={marker.buttonUrl || "#"}
              target={marker.buttonOpenNewTab ? "_blank" : "_self"}
              rel={marker.buttonOpenNewTab ? "noopener noreferrer" : undefined}
              className="marker-sheet__cta"
            >
              {marker.buttonLabel}
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// ─── 3D Buildings Layer ──────────────────────────────────────

function add3dBuildings(map: mapboxgl.Map) {
  if (map.getLayer("3d-buildings")) return;

  const layers = map.getStyle().layers;
  let labelLayerId: string | undefined;
  for (const layer of layers ?? []) {
    if (
      layer.type === "symbol" &&
      (layer.layout as Record<string, unknown>)?.["text-field"]
    ) {
      labelLayerId = layer.id;
      break;
    }
  }

  map.addLayer(
    {
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#aaa",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          0,
          14.05,
          ["get", "height"],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          0,
          14.05,
          ["get", "min_height"],
        ],
        "fill-extrusion-opacity": 0.6,
      },
    },
    labelLayerId
  );
}

// ─── Marker DOM Elements ─────────────────────────────────────

function createMarkerElement(title: string, icon: string, color: string): HTMLElement {
  const hasTitle = !!title.trim();
  const hasIcon = !!icon.trim();

  if (!hasTitle && !hasIcon) {
    const empty = document.createElement("div");
    empty.style.cssText = "width:0;height:0;";
    return empty;
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    display: flex; flex-direction: column; align-items: center;
    cursor: pointer;
  `;

  const pin = document.createElement("div");
  pin.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 8px;
    background: ${color}; color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.24);
    white-space: nowrap; font-size: 13px; font-weight: 600;
    font-family: "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
    line-height: 1; transition: transform 0.15s;
  `;

  if (hasIcon) {
    const iconEl = document.createElement("span");
    iconEl.className = "material-symbols-rounded";
    iconEl.style.cssText = `
      font-size: 18px; color: #fff;
      font-variation-settings: 'wght' 400, 'FILL' 1; user-select: none;
    `;
    iconEl.textContent = icon;
    pin.appendChild(iconEl);
  }

  if (hasTitle) {
    const titleEl = document.createElement("span");
    titleEl.textContent = title;
    titleEl.style.cssText = "user-select: none;";
    pin.appendChild(titleEl);
  }

  wrapper.appendChild(pin);

  const arrow = document.createElement("div");
  arrow.style.cssText = `
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid ${color};
  `;
  wrapper.appendChild(arrow);

  wrapper.addEventListener("mouseenter", () => { pin.style.transform = "scale(1.08)"; });
  wrapper.addEventListener("mouseleave", () => { pin.style.transform = "scale(1)"; });
  return wrapper;
}

