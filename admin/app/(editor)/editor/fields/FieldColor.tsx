"use client";

import { useState, useEffect } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

const VALID_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function FieldColor({ field, value, onChange }: Props) {
  const savedColor = (value as string) ?? (field.default as string) ?? "#000000";
  const [hexInput, setHexInput] = useState(savedColor);

  // Sync local state when external value changes (e.g. color swatch)
  useEffect(() => {
    setHexInput(savedColor);
  }, [savedColor]);

  return (
    <FieldWrapper field={field}>
      <div className="sf-color-row">
        <input
          id={`sf-${field.key}`}
          type="color"
          className="sf-color-swatch"
          value={VALID_HEX.test(savedColor) ? savedColor : "#000000"}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        <input
          type="text"
          className="sf-input sf-input--color-hex"
          value={hexInput}
          onChange={(e) => {
            setHexInput(e.target.value);
            if (VALID_HEX.test(e.target.value)) {
              onChange(field.key, e.target.value);
            }
          }}
          onBlur={() => {
            if (!VALID_HEX.test(hexInput)) {
              setHexInput(savedColor);
            }
          }}
          maxLength={9}
        />
      </div>
    </FieldWrapper>
  );
}
