"use client";

/**
 * FieldColor — Color picker field for the editor settings panel.
 * Uses the same ColorTokenField (cs-field__color-row, cs-field__swatch,
 * cs-field__hex-display, cp-popup) used everywhere else in the editor.
 */

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { ColorTokenField } from "../panels/ColorTokenField";
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
      <ColorTokenField
        label=""
        value={color}
        onChange={(hex) => onChange(field.key, hex)}
      />
    </FieldWrapper>
  );
}
