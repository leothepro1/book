"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type Side = "top" | "right" | "bottom" | "left";

const SIDE_KEYS: Record<Side, string> = {
  top: "paddingTop",
  right: "paddingRight",
  bottom: "paddingBottom",
  left: "paddingLeft",
};

type Props = {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  onChange: (keyOrPatch: string | Record<string, unknown>, value?: number) => void;
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function FieldSpacing({ paddingTop, paddingRight, paddingBottom, paddingLeft, onChange }: Props) {
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const values: Record<Side, number> = {
    top: paddingTop,
    right: paddingRight,
    bottom: paddingBottom,
    left: paddingLeft,
  };

  const handleSliceClick = useCallback((side: Side, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopupPos({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    setActiveSide(side);
  }, []);

  const [linked, setLinked] = useState(() => {
    const v = [paddingTop, paddingRight, paddingBottom, paddingLeft];
    return v.every((x) => x === v[0]);
  });

  const handlePopupChange = useCallback((val: number) => {
    if (!activeSide) return;
    const clamped = Math.min(120, Math.max(0, val));
    if (linked) {
      onChange({ paddingTop: clamped, paddingRight: clamped, paddingBottom: clamped, paddingLeft: clamped });
    } else {
      onChange(SIDE_KEYS[activeSide], clamped);
    }
  }, [activeSide, linked, onChange]);

  const handleLink = useCallback(() => {
    if (linked) {
      setLinked(false);
      return;
    }
    // Find most common value, set all to it
    const vals = [paddingTop, paddingRight, paddingBottom, paddingLeft];
    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
    let best = vals[0];
    let bestCount = 0;
    for (const [v, c] of counts) {
      if (c > bestCount) { best = v; bestCount = c; }
    }
    onChange({ paddingTop: best, paddingRight: best, paddingBottom: best, paddingLeft: best });
    setLinked(true);
  }, [linked, paddingTop, paddingRight, paddingBottom, paddingLeft, onChange]);

  return (
    <>
      <div className="sp-box" ref={containerRef}>
        {/* 4 triangle slices */}
        <SpacingSlice side="top" value={values.top} onClick={handleSliceClick} />
        <SpacingSlice side="right" value={values.right} onClick={handleSliceClick} />
        <SpacingSlice side="bottom" value={values.bottom} onClick={handleSliceClick} />
        <SpacingSlice side="left" value={values.left} onClick={handleSliceClick} />

        {/* Diagonal lines (SVG overlay) */}
        <svg className="sp-box__lines" viewBox="0 0 200 120" preserveAspectRatio="none">
          <line x1="0" y1="0" x2="100" y2="60" />
          <line x1="200" y1="0" x2="100" y2="60" />
          <line x1="200" y1="120" x2="100" y2="60" />
          <line x1="0" y1="120" x2="100" y2="60" />
        </svg>

        {/* Center link toggle — rendered last so it's on top */}
        <button
          type="button"
          className={`sp-box__center ${linked ? "sp-box__center--active" : ""}`}
          onClick={handleLink}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <LinkIcon />
        </button>
      </div>

      {activeSide && (
        <SpacingPopup
          side={activeSide}
          value={values[activeSide]}
          position={popupPos}
          onChange={handlePopupChange}
          onClose={() => setActiveSide(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SLICE
// ═══════════════════════════════════════════════════════════════

const CLIP_PATHS: Record<Side, string> = {
  top: "polygon(0 0, 100% 0, 50% 50%)",
  right: "polygon(100% 0, 100% 100%, 50% 50%)",
  bottom: "polygon(0 100%, 100% 100%, 50% 50%)",
  left: "polygon(0 0, 0 100%, 50% 50%)",
};

const LABEL_POS: Record<Side, React.CSSProperties> = {
  top: { top: "15%", left: "50%", transform: "translateX(-50%)" },
  right: { top: "50%", right: "12%", transform: "translateY(-50%)" },
  bottom: { bottom: "15%", left: "50%", transform: "translateX(-50%)" },
  left: { top: "50%", left: "12%", transform: "translateY(-50%)" },
};

function SpacingSlice({
  side,
  value,
  onClick,
}: {
  side: Side;
  value: number;
  onClick: (side: Side, e: React.MouseEvent) => void;
}) {
  const isVertical = side === "top" || side === "bottom";

  return (
    <div
      className={`sp-slice sp-slice--${side}`}
      style={{
        clipPath: CLIP_PATHS[side],
        background: "#fff",
      }}
      onClick={(e) => onClick(side, e)}
    >
      <span className="sp-slice__value" style={LABEL_POS[side]}>
        {value > 0 ? value : "—"}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POPUP
// ═══════════════════════════════════════════════════════════════

const SIDE_LABELS: Record<Side, string> = {
  top: "Topp",
  right: "Höger",
  bottom: "Botten",
  left: "Vänster",
};

function SpacingPopup({
  side,
  value,
  position,
  onChange,
  onClose,
}: {
  side: Side;
  value: number;
  position: { x: number; y: number };
  onChange: (val: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(value);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  // Sync from parent
  const prev = useRef(value);
  if (value !== prev.current) { prev.current = value; setLocal(value); }

  // Measure popup and clamp to viewport
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

  // Close on outside click
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
      <div className="sp-popup__header">{SIDE_LABELS[side]}</div>
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
// ICON
// ═══════════════════════════════════════════════════════════════

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M15.842 4.175a3.746 3.746 0 0 0-5.298 0l-2.116 2.117a3.75 3.75 0 0 0 .01 5.313l.338.336a.75.75 0 1 0 1.057-1.064l-.339-.337a2.25 2.25 0 0 1-.005-3.187l2.116-2.117a2.246 2.246 0 1 1 3.173 3.18l-1.052 1.047a.75.75 0 0 0 1.058 1.064l1.052-1.047a3.746 3.746 0 0 0 .006-5.305Zm-11.664 11.67a3.75 3.75 0 0 0 5.304 0l2.121-2.121a3.75 3.75 0 0 0 0-5.303l-.362-.362a.75.75 0 0 0-1.06 1.06l.362.362a2.25 2.25 0 0 1 0 3.182l-2.122 2.122a2.25 2.25 0 1 1-3.182-3.182l1.07-1.07a.75.75 0 1 0-1.062-1.06l-1.069 1.069a3.75 3.75 0 0 0 0 5.303Z" />
    </svg>
  );
}
