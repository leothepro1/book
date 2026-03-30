"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

type GlobePoint = { lat: number; lng: number; city: string; country: string; count: number };

type PinHoverData = { city: string; country: string; visitors: number; x: number; y: number } | null;

function latLngToXYZ(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

type GeoFeature = {
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

/* ── Land mask ── */

function createLandMask(features: GeoFeature[]): THREE.CanvasTexture {
  const W = 2048, H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";

  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;
    const drawPoly = (rings: number[][][]) => {
      for (const ring of rings) {
        ctx.beginPath();
        let moved = false;
        for (let i = 0; i < ring.length; i++) {
          if (i > 0 && Math.abs(ring[i][0] - ring[i - 1][0]) > 90) {
            const x = ((ring[i][0] + 180) / 360) * W;
            const y = ((90 - ring[i][1]) / 180) * H;
            ctx.moveTo(x, y);
            continue;
          }
          const x = ((ring[i][0] + 180) / 360) * W;
          const y = ((90 - ring[i][1]) / 180) * H;
          if (!moved) { ctx.moveTo(x, y); moved = true; } else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
    };
    if (geom.type === "Polygon") drawPoly(geom.coordinates as number[][][]);
    else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as number[][][][]) drawPoly(poly);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

/* ── Pin texture — Material Symbols "location_on" filled ── */

function createPinTexture(): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  // Material Symbols location_on (filled, 24px viewBox scaled to 128px)
  const scale = S / 24;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#13ACF0";
  const p = new Path2D("M12 21.325q-.35 0-.7-.125t-.625-.375Q9.05 19.325 7.8 17.9t-2.2-2.95q-.95-1.525-1.525-3.075T3.5 8.8q0-3.55 2.325-5.675T12 1q3.85 0 6.175 2.125T20.5 8.8q0 1.525-.575 3.075T18.4 14.95q-.95 1.525-2.2 2.95T13.325 20.825q-.275.25-.625.375t-.7.125ZM12 12q.825 0 1.413-.587T14 10q0-.825-.587-1.412T12 8q-.825 0-1.412.588T10 10q0 .825.588 1.413T12 12Z");
  ctx.fill(p);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ── Globe shader ── */

const vertSrc = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragSrc = /* glsl */ `
  uniform sampler2D landMask;
  uniform vec3 northColor;
  uniform vec3 southColor;
  uniform float landDarken;
  varying vec2 vUv;

  void main() {
    vec3 base = mix(southColor, northColor, vUv.y);
    vec3 ocean = base * 1.15;
    vec3 land = base * landDarken;
    float isLand = texture2D(landMask, vUv).r;
    gl_FragColor = isLand > 0.5 ? vec4(land, 1.0) : vec4(ocean, 1.0);
  }
`;

/* ── Component ── */

type PinEntry = { sprite: THREE.Sprite; city: string; country: string; visitors: number };

type Props = {
  points: GlobePoint[];
  onPinHover?: (data: PinHoverData) => void;
};

export function GlobeRenderer({ points, onPinHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPinHoverRef = useRef(onPinHover);
  onPinHoverRef.current = onPinHover;

  const sceneRef = useRef<{
    pinsGroup: THREE.Group;
    pinEntries: PinEntry[];
    rotatable: THREE.Object3D[];
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    globe: THREE.Mesh<THREE.SphereGeometry, THREE.Material>;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animFrame: number;
    _cleanup?: () => void;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const rafId = requestAnimationFrame(() => {
      if (cancelled || !containerRef.current) return;

      const W = container.clientWidth || 800;
      const H = container.clientHeight || 600;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      camera.position.z = 2.8;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      container.appendChild(renderer.domElement);
      renderer.domElement.style.cursor = "grab";
      renderer.domElement.style.touchAction = "none";

      /* Globe */
      const globeGeo = new THREE.SphereGeometry(1, 64, 64);
      const posAttr = globeGeo.getAttribute("position");
      const vc = new Float32Array(posAttr.count * 3);
      const sC = new THREE.Color(0xB7DAF8);
      const nC = new THREE.Color(0xE5F4EE);
      for (let i = 0; i < posAttr.count; i++) {
        const t = (posAttr.getY(i) + 1) / 2;
        const c = new THREE.Color().lerpColors(sC, nC, t);
        vc[i * 3] = c.r; vc[i * 3 + 1] = c.g; vc[i * 3 + 2] = c.b;
      }
      globeGeo.setAttribute("color", new THREE.Float32BufferAttribute(vc, 3));
      const globe = new THREE.Mesh<THREE.SphereGeometry, THREE.Material>(
        globeGeo, new THREE.MeshBasicMaterial({ vertexColors: true }),
      );
      scene.add(globe);

      /* Atmosphere */
      const innerAtm = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0xa8e6ef, transparent: true, opacity: 0.20, side: THREE.BackSide }),
      );
      scene.add(innerAtm);
      const outerAtm = new THREE.Mesh(
        new THREE.SphereGeometry(1.22, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0xc8eef5, transparent: true, opacity: 0.10, side: THREE.BackSide }),
      );
      scene.add(outerAtm);

      scene.add(new THREE.AmbientLight(0xffffff, 0.9));

      const pinsGroup = new THREE.Group();
      scene.add(pinsGroup);

      const rotatable: THREE.Object3D[] = [globe, innerAtm, outerAtm, pinsGroup];

      // Start facing Sweden
      const swedenPos = latLngToXYZ(62, 16, 1).normalize();
      const targetAngleY = Math.atan2(swedenPos.x, swedenPos.z);
      const targetAngleX = -Math.asin(swedenPos.y) + 2.0;
      for (const o of rotatable) {
        o.rotation.y = -targetAngleY;
        o.rotation.x = targetAngleX;
      }

      /* Raycaster for pin hover */
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      /* Drag */
      let isDragging = false;
      let prevMouse = { x: 0, y: 0 };
      const canvas = renderer.domElement;

      const onDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; canvas.style.cursor = "grabbing"; };
      const onDrag = (e: MouseEvent) => {
        if (!isDragging) return;
        const dx = (e.clientX - prevMouse.x) * 0.005;
        const dy = (e.clientY - prevMouse.y) * 0.005;
        prevMouse = { x: e.clientX, y: e.clientY };
        for (const o of rotatable) { o.rotation.y += dx; o.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, o.rotation.x + dy)); }
      };
      const onUp = () => { isDragging = false; canvas.style.cursor = "grab"; };

      /* Hover — raycast pins (throttled to 1x per animation frame) */
      let hoverRafPending = false;
      const onHover = (e: MouseEvent) => {
        if (hoverRafPending || isDragging) return;
        hoverRafPending = true;
        const clientX = e.clientX, clientY = e.clientY;
        requestAnimationFrame(() => {
          hoverRafPending = false;
          const s = sceneRef.current;
          if (!s || s.pinEntries.length === 0) return;

          const rect = canvas.getBoundingClientRect();
          mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const sprites = s.pinEntries.map((p) => p.sprite);
          const hits = raycaster.intersectObjects(sprites);

          if (hits.length > 0) {
            const hit = hits[0].object as THREE.Sprite;
            const entry = s.pinEntries.find((p) => p.sprite === hit);
            if (entry) {
              const wp = hit.position.clone();
              pinsGroup.updateMatrixWorld();
              wp.applyMatrix4(pinsGroup.matrixWorld);
              wp.project(camera);
              const sx = ((wp.x + 1) / 2) * rect.width + rect.left;
              const sy = ((-wp.y + 1) / 2) * rect.height + rect.top;
              onPinHoverRef.current?.({ city: entry.city, country: entry.country, visitors: entry.visitors, x: sx, y: sy - 20 });
              canvas.style.cursor = "pointer";
              return;
            }
          }
          onPinHoverRef.current?.(null);
          if (!isDragging) canvas.style.cursor = "grab";
        });
      };

      canvas.addEventListener("mousedown", onDown);
      canvas.addEventListener("mousemove", onHover);
      window.addEventListener("mousemove", onDrag);
      window.addEventListener("mouseup", onUp);

      const onWheel = (e: WheelEvent) => { e.preventDefault(); camera.position.z = Math.max(1.4, Math.min(5, camera.position.z + e.deltaY * 0.003)); };
      canvas.addEventListener("wheel", onWheel, { passive: false });

      const onResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth; const h = containerRef.current.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      let animFrame = 0;
      const PIN_BASE = 0.010;
      const animate = () => {
        if (cancelled) return;
        animFrame = requestAnimationFrame(animate);
        const s = sceneRef.current;
        if (s && s.pinEntries.length > 0) {
          // Constant screen-space size: cancel out perspective by scaling with distance
          const z = camera.position.z;
          const ps = Math.min(PIN_BASE * (z / 2.8), PIN_BASE * 1.3);
          const psY = ps;
          for (const e of s.pinEntries) e.sprite.scale.set(ps, psY, ps);
        }
        renderer.render(scene, camera);
      };
      animate();

      sceneRef.current = { pinsGroup, pinEntries: [], rotatable, renderer, camera, globe, raycaster, mouse, animFrame };

      /* Load land → shader */
      fetch("/countries-110m.json")
        .then((r) => r.json())
        .then((topology: Topology<{ countries: GeometryCollection }>) => {
          if (cancelled) return;
          const wg = feature(topology, topology.objects.countries);
          const features = ("features" in wg ? wg.features : [wg]) as GeoFeature[];
          const landTex = createLandMask(features);

          globe.material = new THREE.ShaderMaterial({
            uniforms: {
              landMask: { value: landTex },
              northColor: { value: new THREE.Color(0xE5F4EE) },
              southColor: { value: new THREE.Color(0xB7DAF8) },
              landDarken: { value: 0.82 },
            },
            vertexShader: vertSrc,
            fragmentShader: fragSrc,
          });
        })
        .catch(() => {});

      sceneRef.current._cleanup = () => {
        canvas.removeEventListener("mousedown", onDown);
        canvas.removeEventListener("mousemove", onHover);
        canvas.removeEventListener("wheel", onWheel);
        window.removeEventListener("mousemove", onDrag);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("resize", onResize);
      };
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const s = sceneRef.current;
      if (s) { cancelAnimationFrame(s.animFrame); s._cleanup?.(); s.renderer.dispose(); const c = container.querySelector("canvas"); if (c) container.removeChild(c); }
      sceneRef.current = null;
    };
  }, []);

  /* ── Update visitor pins ── */
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const group = s.pinsGroup;
    while (group.children.length > 0) group.remove(group.children[0]);

    // Points are pre-grouped by city from the API (each has .count)
    const pinTex = createPinTexture();
    const PIN_SIZE = 0.025;
    const entries: PinEntry[] = [];

    for (const loc of points) {
      const normal = latLngToXYZ(loc.lat, loc.lng, 1.0).normalize();

      const mat = new THREE.SpriteMaterial({
        map: pinTex,
        transparent: true,
        sizeAttenuation: false,
      });

      const sprite = new THREE.Sprite(mat);
      const tipOffset = 0.35 * PIN_SIZE;
      const elevation = 1.02;
      sprite.position.set(
        normal.x * elevation + normal.x * tipOffset,
        normal.y * elevation + normal.y * tipOffset,
        normal.z * elevation + normal.z * tipOffset,
      );
      sprite.scale.set(PIN_SIZE, PIN_SIZE, PIN_SIZE);

      group.add(sprite);
      entries.push({ sprite, city: loc.city, country: loc.country, visitors: loc.count });
    }

    s.pinEntries = entries;
  }, [points]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
