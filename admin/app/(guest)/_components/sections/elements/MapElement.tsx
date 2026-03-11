"use client";

/**
 * MapElement — Renders a saved map configuration.
 *
 * Looks up the map by `map_id` from tenantConfig.maps[],
 * then renders an interactive Mapbox GL map with the saved
 * style, camera, markers, and feature toggles.
 *
 * Element-level settings control only display: height and border radius.
 * All map configuration lives in the MapConfig (managed in /maps admin page).
 */

import { useRef, useEffect, useState, useMemo } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import type { MapConfig, MapMarkerConfig } from "@/app/(guest)/_lib/tenant/types";
import { useMaps } from "./MapsContext";

// ─── Style Map ───────────────────────────────────────────────

const STYLE_MAP: Record<string, string> = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ─── Component ───────────────────────────────────────────────

export function MapElement({ resolved }: { resolved: ResolvedElement }) {
  const maps = useMaps();
  const { settings } = resolved;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Element-level settings (display)
  const mapId = (settings.map_id as string) || "";
  const height = (settings.map_height as number) ?? 400;
  const borderRadius = (settings.map_border_radius as number) ?? 12;

  // Resolve map config
  const mapConfig = useMemo(() => {
    if (!maps || !mapId) return null;
    return maps.find((m) => m.id === mapId) ?? null;
  }, [maps, mapId]);

  // Extract map properties (with fallbacks)
  const styleName = mapConfig?.style || "light";
  const customStyle = mapConfig?.customStyle || "";
  const zoom = mapConfig?.zoom ?? 14;
  const pitch = mapConfig?.pitch ?? 0;
  const bearing = mapConfig?.bearing ?? 0;
  const buildings3d = mapConfig?.buildings3d ?? false;
  const scrollZoom = mapConfig?.scrollZoom ?? false;
  const showPlaceLabels = mapConfig?.showPlaceLabels ?? true;
  const showRoadLabels = mapConfig?.showRoadLabels ?? true;
  const markers = mapConfig?.markers ?? [];

  const styleUrl =
    styleName === "custom" && customStyle
      ? customStyle
      : STYLE_MAP[styleName] || STYLE_MAP.light;

  // Map center
  const center = useMemo((): [number, number] => {
    if (mapConfig?.centerLat && mapConfig?.centerLng) {
      return [mapConfig.centerLng, mapConfig.centerLat];
    }
    if (markers.length > 0 && markers[0].lat && markers[0].lng) {
      return [markers[0].lng, markers[0].lat];
    }
    return [18.0686, 59.3293]; // Stockholm fallback
  }, [mapConfig?.centerLat, mapConfig?.centerLng, markers]);

  // ── Initialize map ──
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN || !mapConfig) return;

    let cancelled = false;

    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !containerRef.current) return;

      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.default.Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom,
        pitch,
        bearing,
        scrollZoom,
        attributionControl: false,
      });

      map.addControl(
        new mapboxgl.default.AttributionControl({ compact: true }),
        "bottom-left"
      );

      map.on("style.load", () => {
        if (buildings3d) {
          add3dBuildings(map);
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
  }, [styleUrl, mapConfig?.id]);

  // ── Update camera ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.easeTo({ center, zoom, pitch, bearing, duration: 600 });
  }, [loaded, center, zoom, pitch, bearing]);

  // ── Scroll zoom toggle ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (scrollZoom) map.scrollZoom.enable();
    else map.scrollZoom.disable();
  }, [loaded, scrollZoom]);

  // ── 3D buildings toggle ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (buildings3d) {
      add3dBuildings(map);
    } else if (map.getLayer("3d-buildings")) {
      map.removeLayer("3d-buildings");
    }
  }, [loaded, buildings3d]);

  // ── Place labels ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const style = map.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.id.includes("poi") && layer.type === "symbol") {
        map.setLayoutProperty(layer.id, "visibility", showPlaceLabels ? "visible" : "none");
      }
    }
  }, [loaded, showPlaceLabels]);

  // ── Road labels ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const style = map.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.id.includes("road") && layer.type === "symbol") {
        map.setLayoutProperty(layer.id, "visibility", showRoadLabels ? "visible" : "none");
      }
    }
  }, [loaded, showRoadLabels]);

  // ── Render markers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    import("mapbox-gl").then((mapboxgl) => {
      markers.filter((m) => m.isActive !== false).forEach((m) => {
        if (!m.lat || !m.lng) return;
        if (!m.title?.trim() && !m.icon?.trim()) return;

        const el = createMarkerElement(m.title, m.icon, m.color);
        const marker = new mapboxgl.default.Marker({ element: el, anchor: "bottom", pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat([
          m.lng,
          m.lat,
        ]);

        marker.addTo(map);
        markersRef.current.push(marker);
      });

    });
  }, [loaded, markers, center]);

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
          className="material-symbols-outlined"
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
    <div
      ref={containerRef}
      style={{ width: "100%", height, borderRadius, overflow: "hidden" }}
    />
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
    iconEl.className = "material-symbols-outlined";
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

// ─── Popup HTML Builder ──────────────────────────────────────

function buildPopupHTML(marker: MapMarkerConfig): string {
  const titleHtml = marker.title
    ? `<div style="font-weight:600;font-size:14px;color:#1a1a1a;margin-bottom:2px">${escapeHtml(marker.title)}</div>`
    : "";
  const descHtml = marker.description
    ? `<div style="font-size:13px;color:#6B6A68;line-height:1.4">${escapeHtml(marker.description)}</div>`
    : "";
  return `<div style="padding:4px 2px">${titleHtml}${descHtml}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
