"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldColor({ field, value, onChange }: Props) {
  const color = (value as string) ?? (field.default as string) ?? "#000000";

  return (
    <FieldWrapper field={field}>
      <div className="sf-color-row">
        <input
          id={`sf-${field.key}`}
          type="color"
          className="sf-color-swatch"
          value={color}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        <input
          type="text"
          className="sf-input sf-input--color-hex"
          value={color}
          onChange={(e) => onChange(field.key, e.target.value)}
          maxLength={9}
        />
      </div>
    </FieldWrapper>
  );
}
