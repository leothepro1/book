"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldText({ field, value, onChange }: Props) {
  return (
    <FieldWrapper field={field}>
      <input
        id={`sf-${field.key}`}
        type="text"
        className="sf-input"
        value={(value as string) ?? ""}
        placeholder={field.default as string}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </FieldWrapper>
  );
}
