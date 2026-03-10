"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldTextarea({ field, value, onChange }: Props) {
  return (
    <FieldWrapper field={field}>
      <textarea
        id={`sf-${field.key}`}
        className="sf-textarea"
        value={(value as string) ?? ""}
        placeholder={field.default as string}
        rows={3}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </FieldWrapper>
  );
}
