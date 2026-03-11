"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import type { MapConfig, MapMarkerConfig } from "./maps-constants";
import { STYLE_MAP, MAPBOX_TOKEN } from "./maps-constants";

export function MapPreview({ map }: { map: MapConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mapboxRef = useRef<typeof import("mapbox-gl") | null>(null);

  const styleUrl =
    map.style === "custom" && map.customStyle
      ? map.customStyle
      : STYLE_MAP[map.style] || STYLE_MAP.light;

  const center = useMemo((): [number, number] => {
    if (map.centerLat && map.centerLng) return [map.centerLng, map.centerLat];
    if (map.markers.length > 0 && map.markers[0].lat && map.markers[0].lng) {
      return [map.markers[0].lng, map.markers[0].lat];
    }
    return [18.0686, 59.3293];
  }, [map.centerLat, map.centerLng, map.markers]);

  // ── Initialize map (re-init on style change) ──
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    let cancelled = false;

    import("mapbox-gl").then((mb) => {
      if (cancelled || !containerRef.current) return;
      mapboxRef.current = mb;
      mb.default.accessToken = MAPBOX_TOKEN;

      const instance = new mb.default.Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom: map.zoom,
        pitch: map.pitch,
        bearing: map.bearing,
        scrollZoom: map.scrollZoom,
        attributionControl: false,
      });

      instance.addControl(
        new mb.default.AttributionControl({ compact: true }),
        "bottom-left"
      );

      instance.on("style.load", () => {
        if (map.buildings3d) add3dBuildings(instance);
        setLoaded(true);
      });

      mapRef.current = instance;
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
  }, [styleUrl]);

  // ── Camera (smooth animation) ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    m.easeTo({ center, zoom: map.zoom, pitch: map.pitch, bearing: map.bearing, duration: 400 });
  }, [loaded, center, map.zoom, map.pitch, map.bearing]);

  // ── Scroll zoom ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    if (map.scrollZoom) m.scrollZoom.enable();
    else m.scrollZoom.disable();
  }, [loaded, map.scrollZoom]);

  // ── Place labels ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    const show = map.showPlaceLabels ?? true;
    const style = m.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.id.includes("poi") && layer.type === "symbol") {
        m.setLayoutProperty(layer.id, "visibility", show ? "visible" : "none");
      }
    }
  }, [loaded, map.showPlaceLabels]);

  // ── Road labels ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    const show = map.showRoadLabels ?? true;
    const style = m.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.id.includes("road") && layer.type === "symbol") {
        m.setLayoutProperty(layer.id, "visibility", show ? "visible" : "none");
      }
    }
  }, [loaded, map.showRoadLabels]);

  // ── 3D buildings ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    if (map.buildings3d) {
      add3dBuildings(m);
    } else if (m.getLayer("3d-buildings")) {
      m.removeLayer("3d-buildings");
    }
  }, [loaded, map.buildings3d]);

  // ── Markers ──
  useEffect(() => {
    const m = mapRef.current;
    const mb = mapboxRef.current;
    if (!m || !loaded || !mb) return;

    // Clear
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

    // Custom markers (only active ones)
    map.markers.filter((mk) => mk.isActive !== false).forEach((mk) => {
      if (!mk.lat || !mk.lng) return;
      if (!mk.title?.trim() && !mk.icon?.trim()) return;
      const el = createMarkerElement(mk.title, mk.icon, mk.color);
      const marker = new mb.default.Marker({ element: el, anchor: "bottom", pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat([mk.lng, mk.lat]);
      marker.addTo(m);
      markersRef.current.push(marker);
    });
  }, [loaded, map.markers, center]);

  // ── Resize on container size changes ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded || !containerRef.current) return;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [loaded]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="maps-preview-fallback">
        <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#C8C7C5" }}>
          map
        </span>
        <span>Mapbox-token saknas</span>
      </div>
    );
  }

  return <div ref={containerRef} className="maps-preview-map" />;
}

// ─── 3D Buildings Layer ──────────────────────────────────────

function add3dBuildings(map: mapboxgl.Map) {
  if (map.getLayer("3d-buildings")) return;
  const layers = map.getStyle().layers;
  let labelLayerId: string | undefined;
  for (const layer of layers ?? []) {
    if (layer.type === "symbol" && (layer.layout as Record<string, unknown>)?.["text-field"]) {
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
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.05, ["get", "height"]],
        "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.05, ["get", "min_height"]],
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
