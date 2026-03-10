"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * FieldCornerRadius — 4-corner border-radius editor.
 *
 * Layout: rectangle with 4 clickable corner zones (quadrants).
 * Each corner shows its radius value. Click to open popup (same as spacing).
 * Center link button locks/unlocks all corners.
 *
 * Shares CSS classes with FieldSpacing where possible:
 *   sp-box__center, sp-box__center--active (link button)
 *   sp-slice__value (value labels)
 *   sp-popup, sp-popup__* (popup)
 */

type Corner = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

type Props = {
  radiusTopLeft: number;
  radiusTopRight: number;
  radiusBottomRight: number;
  radiusBottomLeft: number;
  onChange: (keyOrPatch: string | Record<string, unknown>, value?: number) => void;
};

const CORNER_KEYS: Record<Corner, string> = {
  topLeft: "radiusTopLeft",
  topRight: "radiusTopRight",
  bottomRight: "radiusBottomRight",
  bottomLeft: "radiusBottomLeft",
};

const CORNER_LABELS: Record<Corner, string> = {
  topLeft: "Uppe vänster",
  topRight: "Uppe höger",
  bottomRight: "Nere höger",
  bottomLeft: "Nere vänster",
};

const CORNERS: Corner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

export function FieldCornerRadius({
  radiusTopLeft,
  radiusTopRight,
  radiusBottomRight,
  radiusBottomLeft,
  onChange,
}: Props) {
  const [activeCorner, setActiveCorner] = useState<Corner | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const values: Record<Corner, number> = {
    topLeft: radiusTopLeft,
    topRight: radiusTopRight,
    bottomRight: radiusBottomRight,
    bottomLeft: radiusBottomLeft,
  };

  const handleCornerClick = useCallback((corner: Corner, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopupPos({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    setActiveCorner(corner);
  }, []);

  const [linked, setLinked] = useState(() => {
    const v = [radiusTopLeft, radiusTopRight, radiusBottomRight, radiusBottomLeft];
    return v.every((x) => x === v[0]);
  });

  const handlePopupChange = useCallback((val: number) => {
    if (!activeCorner) return;
    const clamped = Math.min(120, Math.max(0, val));
    if (linked) {
      onChange({
        radiusTopLeft: clamped,
        radiusTopRight: clamped,
        radiusBottomRight: clamped,
        radiusBottomLeft: clamped,
      });
    } else {
      onChange(CORNER_KEYS[activeCorner], clamped);
    }
  }, [activeCorner, linked, onChange]);

  const handleLink = useCallback(() => {
    if (linked) {
      setLinked(false);
      return;
    }
    const vals = [radiusTopLeft, radiusTopRight, radiusBottomRight, radiusBottomLeft];
    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
    let best = vals[0];
    let bestCount = 0;
    for (const [v, c] of counts) {
      if (c > bestCount) { best = v; bestCount = c; }
    }
    onChange({
      radiusTopLeft: best,
      radiusTopRight: best,
      radiusBottomRight: best,
      radiusBottomLeft: best,
    });
    setLinked(true);
  }, [linked, radiusTopLeft, radiusTopRight, radiusBottomRight, radiusBottomLeft, onChange]);

  return (
    <>
      <div className="cr-box">
        {/* 2x2 grid of corner zones */}
        {CORNERS.map((corner) => (
          <div
            key={corner}
            className={`cr-corner cr-corner--${corner}`}
            onClick={(e) => handleCornerClick(corner, e)}
          >
            <span className="sp-slice__value cr-corner__value">
              {values[corner] > 0 ? values[corner] : "—"}
            </span>
          </div>
        ))}

        {/* Divider lines */}
        <div className="cr-box__line cr-box__line--h" />
        <div className="cr-box__line cr-box__line--v" />

        {/* Center link toggle — same class as spacing */}
        <button
          type="button"
          className={`sp-box__center ${linked ? "sp-box__center--active" : ""}`}
          onClick={handleLink}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <LinkIcon />
        </button>
      </div>

      {activeCorner && (
        <RadiusPopup
          corner={activeCorner}
          value={values[activeCorner]}
          position={popupPos}
          onChange={handlePopupChange}
          onClose={() => setActiveCorner(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// POPUP (reuses sp-popup CSS classes from FieldSpacing)
// ═══════════════════════════════════════════════════════════════

function RadiusPopup({
  corner,
  value,
  position,
  onChange,
  onClose,
}: {
  corner: Corner;
  value: number;
  position: { x: number; y: number };
  onChange: (val: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(value);
  const [ready, setReady] = useState(false);
  const [offset, setOffset] = useState(0);

  const prev = useRef(value);
  if (value !== prev.current) { prev.current = value; setLocal(value); }

  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(position.x - w / 2, vw - w - 8));
    const top = position.y + 20 + h > vh
      ? Math.max(8, position.y - h - 8)
      : position.y + 20;
    setPos({ left, top });
    setReady(true);
    const t = setTimeout(() => inputRef.current?.select(), 50);
    return () => clearTimeout(t);
  }, [position]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  const handleChange = useCallback((val: number) => {
    const clamped = Math.min(120, Math.max(0, val));
    setLocal(clamped);
    onChange(clamped);
  }, [onChange]);

  const pct = (local / 120) * 100;

  const style: React.CSSProperties = {
    position: "fixed",
    left: pos.left,
    top: pos.top,
    zIndex: 9999,
    visibility: ready ? "visible" : "hidden",
  };

  return createPortal(
    <div ref={ref} className="sp-popup" style={style}>
      <div className="sp-popup__header">{CORNER_LABELS[corner]}</div>
      <div className="sp-popup__body">
        <input
          type="range"
          min={0}
          max={120}
          step={1}
          value={local}
          onChange={(e) => handleChange(Number(e.target.value))}
          className="sp-popup__slider"
          style={{ background: `linear-gradient(to right, #1a1a1a ${pct}%, #ECEBEA ${pct}%)` }}
        />
        <div className="sp-popup__input-wrap">
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={120}
            value={local}
            onChange={(e) => handleChange(Number(e.target.value) || 0)}
            onKeyDown={(e) => { if (e.key === "Enter") onClose(); }}
            className="sp-popup__input"
          />
          <span className="sp-popup__unit">px</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// ICON (shared with FieldSpacing)
// ═══════════════════════════════════════════════════════════════

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M15.842 4.175a3.746 3.746 0 0 0-5.298 0l-2.116 2.117a3.75 3.75 0 0 0 .01 5.313l.338.336a.75.75 0 1 0 1.057-1.064l-.339-.337a2.25 2.25 0 0 1-.005-3.187l2.116-2.117a2.246 2.246 0 1 1 3.173 3.18l-1.052 1.047a.75.75 0 0 0 1.058 1.064l1.052-1.047a3.746 3.746 0 0 0 .006-5.305Zm-11.664 11.67a3.75 3.75 0 0 0 5.304 0l2.121-2.121a3.75 3.75 0 0 0 0-5.303l-.362-.362a.75.75 0 0 0-1.06 1.06l.362.362a2.25 2.25 0 0 1 0 3.182l-2.122 2.122a2.25 2.25 0 1 1-3.182-3.182l1.07-1.07a.75.75 0 1 0-1.062-1.06l-1.069 1.069a3.75 3.75 0 0 0 0 5.303Z" />
    </svg>
  );
}
