"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldNumber({ field, value, onChange }: Props) {
  return (
    <FieldWrapper field={field}>
      <input
        id={`sf-${field.key}`}
        type="number"
        className="sf-input sf-input--number"
        value={(value as number) ?? (field.default as number) ?? 0}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(e) => onChange(field.key, Number(e.target.value))}
      />
    </FieldWrapper>
  );
}
