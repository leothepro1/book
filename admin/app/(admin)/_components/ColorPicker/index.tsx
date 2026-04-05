"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import "./color-picker.css";

/* ── Color conversion helpers ── */

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, v * 100];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h /= 360; s /= 100; v /= 100;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [r * 255, g * 255, b * 255];
}

/* ── Canvas drawing ── */

function drawSatVal(ctx: CanvasRenderingContext2D, hue: number, w: number, h: number) {
  const [r, g, b] = hsvToRgb(hue, 100, 100);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);

  const white = ctx.createLinearGradient(0, 0, w, 0);
  white.addColorStop(0, "rgba(255,255,255,1)");
  white.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, w, h);

  const black = ctx.createLinearGradient(0, 0, 0, h);
  black.addColorStop(0, "rgba(0,0,0,0)");
  black.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = black;
  ctx.fillRect(0, 0, w, h);
}

function drawHueStrip(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 6; i++) {
    const [r, g, b] = hsvToRgb((i / 6) * 360, 100, 100);
    gradient.addColorStop(i / 6, `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

/* ── Component ── */

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function ColorPickerPopup({ value, onChange, onClose, anchorRef }: ColorPickerProps) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const [r, g, b] = hexToRgb(value || "#000000");
    return rgbToHsv(r, g, b);
  });
  const [hexInput, setHexInput] = useState((value || "#000000").toUpperCase());

  const popupRef = useRef<HTMLDivElement>(null);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const isDraggingSV = useRef(false);
  const isDraggingHue = useRef(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const SV_W = 220, SV_H = 160, HUE_W = 24, HUE_H = 160;
  const POPUP_W = 264;

  // Position popup: left-aligned with anchor, above or below
  useEffect(() => {
    if (!anchorRef.current || !popupRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const popupH = popupRef.current.offsetHeight;

    let top = anchor.top - popupH - 8;
    let left = anchor.left - 37;

    // If not enough room above, flip below
    if (top < 8) top = anchor.bottom + 8;
    // Clamp right edge
    if (left + POPUP_W > window.innerWidth - 8) left = window.innerWidth - POPUP_W - 8;
    if (left < 8) left = 8;

    setCoords({ top, left });
  }, [anchorRef]);

  // No auto-focus — preserve editor text selection

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  // Close on any scroll
  useEffect(() => {
    const handleScroll = () => onClose();
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [onClose]);

  // Draw SV canvas
  useEffect(() => {
    const ctx = svCanvasRef.current?.getContext("2d");
    if (ctx) drawSatVal(ctx, hsv[0], SV_W, SV_H);
  }, [hsv[0]]);

  // Draw hue strip
  useEffect(() => {
    const ctx = hueCanvasRef.current?.getContext("2d");
    if (ctx) drawHueStrip(ctx, HUE_W, HUE_H);
  }, []);

  // Emit color
  const emitColor = useCallback((h: number, s: number, v: number) => {
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }, [onChange]);

  // SV interaction
  const handleSV = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newS = x * 100;
    const newV = (1 - y) * 100;
    setHsv([hsv[0], newS, newV]);
    emitColor(hsv[0], newS, newV);
  }, [hsv, emitColor]);

  const onSVDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSV.current = true;
    handleSV(e);
  }, [handleSV]);

  // Hue interaction (vertical)
  const handleHue = useCallback((e: { clientY: number }) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newH = y * 360;
    setHsv([newH, hsv[1], hsv[2]]);
    emitColor(newH, hsv[1], hsv[2]);
  }, [hsv, emitColor]);

  const onHueDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHue.current = true;
    handleHue(e);
  }, [handleHue]);

  // Global mouse handlers
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (isDraggingSV.current) handleSV(e);
      if (isDraggingHue.current) handleHue(e);
    }
    function onUp() {
      isDraggingSV.current = false;
      isDraggingHue.current = false;
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [handleSV, handleHue]);

  // Hex input change — only commit on valid 6-digit hex
  const handleHexChange = useCallback((val: string) => {
    let v = val.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    setHexInput(v.toUpperCase());
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      const [r, g, b] = hexToRgb(v);
      const newHsv = rgbToHsv(r, g, b);
      setHsv(newHsv);
      onChange(v);
    }
  }, [onChange]);

  // Sync from parent
  const prevValue = useRef(value);
  if (value !== prevValue.current) {
    prevValue.current = value;
    const [r, g, b] = hexToRgb(value);
    const newHsv = rgbToHsv(r, g, b);
    setHsv(newHsv);
    setHexInput(value.toUpperCase());
  }

  const svThumbX = (hsv[1] / 100) * SV_W;
  const svThumbY = (1 - hsv[2] / 100) * SV_H;
  const hueThumbY = (hsv[0] / 360) * HUE_H;
  const [previewR, previewG, previewB] = hsvToRgb(hsv[0], hsv[1], hsv[2]);
  const previewHex = rgbToHex(previewR, previewG, previewB);

  // Prevent mousedown on popup from stealing editor focus/selection
  const preventFocusLoss = useCallback((e: React.MouseEvent) => {
    // Allow hex input to receive focus when clicked directly
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
  }, []);

  return (
    <div
      ref={popupRef}
      className="cp-popup"
      style={coords ? { top: coords.top, left: coords.left } : { visibility: "hidden" as const }}
      onMouseDown={preventFocusLoss}
    >
      <div className="cp-picker-row">
        {/* SV area */}
        <div className="cp-sv-wrap" onMouseDown={onSVDown}>
          <canvas ref={svCanvasRef} width={SV_W} height={SV_H} className="cp-sv-canvas" />
          <div
            className="cp-sv-thumb"
            style={{
              left: svThumbX,
              top: svThumbY,
              borderColor: hsv[2] > 50 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
            }}
          />
        </div>

        {/* Hue strip (vertical) */}
        <div className="cp-hue-wrap" onMouseDown={onHueDown}>
          <canvas ref={hueCanvasRef} width={HUE_W} height={HUE_H} className="cp-hue-canvas" />
          <div className="cp-hue-thumb" style={{ top: hueThumbY }} />
        </div>
      </div>

      {/* Hex + preview */}
      <div className="cp-bottom">
        <div className="cp-preview" style={{ background: previewHex }} />
        <input
          ref={hexInputRef}
          type="text"
          className="cp-hex-input"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
