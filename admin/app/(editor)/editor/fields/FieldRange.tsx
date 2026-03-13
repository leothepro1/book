"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldRange({ field, value, onChange }: Props) {
  const num = (value as number) ?? (field.default as number) ?? 0;
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const unit = field.unit || "";

  const [active, setActive] = useState(false);
  const [localValue, setLocalValue] = useState(num);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) setLocalValue(num);
  }, [num, active]);

  const displayValue = active ? localValue : num;
  const pct = ((displayValue - min) / (max - min)) * 100;

  const resolve = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return displayValue;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      return Math.max(min, Math.min(max, +snapped.toFixed(4)));
    },
    [min, max, step, displayValue],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setActive(true);
      const v = resolve(e.clientX);
      setLocalValue(v);
      if (v !== num) onChange(field.key, v);
    },
    [resolve, onChange, num, field.key],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const v = resolve(e.clientX);
      setLocalValue(v);
      if (v !== num) onChange(field.key, v);
    },
    [active, resolve, onChange, num, field.key],
  );

  const onPointerUp = useCallback(() => setActive(false), []);

  return (
    <FieldWrapper field={field}>
      <div className="sf-range-row">
        <div
          ref={trackRef}
          className="sf-range__track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sf-range__fill" style={{ width: `${pct}%` }} />
          <div className={`sf-range__thumb${active ? " sf-range__thumb--active" : ""}`} style={{ left: `${pct}%` }}>
            <div className="sf-range__pin">
              <span className="sf-range__pin-value">{displayValue}{unit}</span>
            </div>
          </div>
        </div>
        <div className="sf-range-input-wrap">
          <input
            type="number"
            className="sf-range-input"
            value={num}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onChange(field.key, Math.min(max, Math.max(min, v)));
            }}
          />
          {unit && <span className="sf-range-unit">{unit}</span>}
        </div>
      </div>
    </FieldWrapper>
  );
}
