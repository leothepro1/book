"use client";

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import type { FieldOnChange } from "./FieldRenderer";
import { FieldCornerRadius } from "./FieldCornerRadius";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: FieldOnChange;
  allValues?: Record<string, unknown>;
};

/**
 * Adapter that bridges the standard FieldRenderer interface
 * to FieldCornerRadius, which reads/writes 4 separate keys.
 */
export function FieldCornerRadiusInline({ field, onChange, allValues }: Props) {
  const vals = allValues ?? {};

  return (
    <FieldWrapper field={field}>
      <FieldCornerRadius
        radiusTopLeft={(vals.radiusTopLeft as number) ?? 0}
        radiusTopRight={(vals.radiusTopRight as number) ?? 0}
        radiusBottomRight={(vals.radiusBottomRight as number) ?? 0}
        radiusBottomLeft={(vals.radiusBottomLeft as number) ?? 0}
        onChange={onChange}
      />
    </FieldWrapper>
  );
}
