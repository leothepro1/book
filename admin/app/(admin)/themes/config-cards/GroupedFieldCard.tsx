"use client";

/**
 * GroupedFieldCard — Shared base for section config cards.
 *
 * Handles the common pattern of:
 * 1. Grouping fields by their `group` property
 * 2. Rendering flat layout for single-group schemas
 * 3. Rendering dividers + labels for multi-group schemas
 * 4. Resolving values with defaults
 *
 * Custom config cards can use this directly (zero custom UI needed)
 * or wrap it with additional UI (previews, custom controls, etc.).
 */

import { FieldRenderer } from "../ThemeConfigureView";
import type { SectionConfigCardProps } from "../configRegistry";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";

const GROUP_LABELS: Record<string, string> = {
  general: "Allmänt",
  colors: "Färger",
  layout: "Layout",
  content: "Innehåll",
  style: "Stil",
  animation: "Animation",
  advanced: "Avancerat",
};

function groupFields(schema: SettingField[]): Map<string, SettingField[]> {
  const groups = new Map<string, SettingField[]>();
  for (const field of schema) {
    const group = field.group ?? "general";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(field);
  }
  return groups;
}

export function GroupedFieldCard({ schema, values, onChange }: SectionConfigCardProps) {
  if (schema.length === 0) {
    return (
      <div className="tc__empty">
        Denna sektion har inga konfigurerbara inställningar.
      </div>
    );
  }

  const groups = groupFields(schema);

  // Single group — flat layout, no group headers
  if (groups.size <= 1) {
    return (
      <div className="tc__fields">
        {schema.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={values[field.key] ?? field.default}
            onChange={(val) => onChange(field.key, val)}
          />
        ))}
      </div>
    );
  }

  // Multiple groups — section dividers + labels
  return (
    <div className="tc__fields">
      {Array.from(groups.entries()).map(([groupKey, fields]) => (
        <div key={groupKey} className="tc__field-group">
          <div className="tc__field-group-label">
            {GROUP_LABELS[groupKey] ?? groupKey}
          </div>
          {fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={values[field.key] ?? field.default}
              onChange={(val) => onChange(field.key, val)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
