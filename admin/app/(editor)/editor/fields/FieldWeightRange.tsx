"use client";

import { useState, useRef, useCallback } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldWeightRange({ field, value, onChange }: Props) {
  const num = (value as number) ?? (field.default as number) ?? 400;
  const min = field.min ?? 100;
  const max = field.max ?? 700;
  const step = field.step ?? 100;

  const snaps = getSnaps(min, max, step);
  const pct = ((num - min) / (max - min)) * 100;

  const [active, setActive] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const resolve = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return num;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      // Snap to nearest step
      const snapped = Math.round(raw / step) * step;
      return Math.max(min, Math.min(max, snapped));
    },
    [min, max, step, num],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setActive(true);
      const v = resolve(e.clientX);
      if (v !== num) onChange(field.key, v);
    },
    [resolve, onChange, field.key, num],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const v = resolve(e.clientX);
      if (v !== num) onChange(field.key, v);
    },
    [active, resolve, onChange, field.key, num],
  );

  const onPointerUp = useCallback(() => {
    setActive(false);
  }, []);

  return (
    <FieldWrapper field={field}>
      <div className="sf-wr">
        {/* Track */}
        <div
          ref={trackRef}
          className="sf-wr__track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Fill */}
          <div className="sf-wr__fill" style={{ width: `${pct}%` }} />

          {/* Snap ticks */}
          {snaps.map((s) => {
            const tickPct = ((s - min) / (max - min)) * 100;
            return (
              <div
                key={s}
                className={`sf-wr__tick${num >= s ? " sf-wr__tick--active" : ""}`}
                style={{ left: `${tickPct}%` }}
              />
            );
          })}

          {/* Thumb */}
          <div
            className={`sf-wr__thumb${active ? " sf-wr__thumb--active" : ""}`}
            style={{ left: `${pct}%` }}
          >
            <div className="sf-wr__pin">
              <span className="sf-wr__pin-value">{num}</span>
            </div>
          </div>
        </div>

        {/* Min / Max labels */}
        <div className="sf-wr__labels">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </FieldWrapper>
  );
}

function getSnaps(min: number, max: number, step: number): number[] {
  const snaps: number[] = [];
  for (let v = min + step; v < max; v += step) {
    snaps.push(v);
  }
  return snaps;
}
