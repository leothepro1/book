"use client";

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

  const pct = ((num - min) / (max - min)) * 100;

  return (
    <FieldWrapper field={field}>
      <div className="sf-range-row">
        <input
          id={`sf-${field.key}`}
          type="range"
          className="sf-range"
          value={num}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #1a1a1a ${pct}%, #ECEBEA ${pct}%)`,
          }}
        />
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
