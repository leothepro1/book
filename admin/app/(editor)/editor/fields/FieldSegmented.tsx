"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldSegmented({ field, value, onChange }: Props) {
  const current = (value as string) ?? field.default ?? "";
  const options = field.options ?? [];

  return (
    <FieldWrapper field={field}>
      <div className="sf-segmented">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`sf-segmented__btn${opt.value === current ? " sf-segmented__btn--active" : ""}`}
            onClick={() => onChange(field.key, opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </FieldWrapper>
  );
}
