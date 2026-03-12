"use client";

/**
 * Field Renderer — Design System for Settings Fields
 * ═══════════════════════════════════════════════════
 *
 * Shared field components used across ALL settings panels.
 * Every section, block, and element uses these same components.
 *
 * The FieldRenderer dispatches to the correct field component
 * based on the SettingField schema type. Individual field components
 * handle their own layout, validation, and interaction.
 *
 * LAYOUT CONVENTION:
 *   ┌──────────────────────────────┐
 *   │ Label                        │  ← sf-label
 *   │ Description (optional)       │  ← sf-desc
 *   │ ┌──────────────────────────┐ │
 *   │ │       Input control       │ │  ← sf-control (varies by type)
 *   │ └──────────────────────────┘ │
 *   └──────────────────────────────┘
 *
 * CSS prefix: sf-* (settings field)
 */

import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldText } from "./FieldText";
import { FieldTextarea } from "./FieldTextarea";
import { FieldSelect } from "./FieldSelect";
import { FieldToggle } from "./FieldToggle";
import { FieldNumber } from "./FieldNumber";
import { FieldRange } from "./FieldRange";
import { FieldColor } from "./FieldColor";
import { FieldUrl } from "./FieldUrl";
import { FieldRichText } from "./FieldRichText";
import { FieldLink } from "./FieldLink";
import { FieldSegmented } from "./FieldSegmented";
import { FieldImage } from "./FieldImage";
import { FieldCornerRadiusInline } from "./FieldCornerRadiusInline";
import { FieldWeightRange } from "./FieldWeightRange";
import { FieldMarkers } from "./FieldMarkers";
import { FieldMapPicker } from "./FieldMapPicker";
import { FieldVideo } from "./FieldVideo";
import { FieldImageList } from "./FieldImageList";

// ─── Field Dispatcher ───────────────────────────────────────

/** Supports single key/value OR a batch patch object (e.g. for multi-key fields like corner radius). */
export type FieldOnChange = (keyOrPatch: string | Record<string, unknown>, value?: unknown) => void;

type FieldRendererProps = {
  field: SettingField;
  value: unknown;
  onChange: FieldOnChange;
  /** Full values record — lets fields read sibling keys (e.g. richtext reads "link"). */
  allValues?: Record<string, unknown>;
};

const FIELD_MAP: Record<string, React.ComponentType<FieldRendererProps>> = {
  text: FieldText,
  textarea: FieldTextarea,
  select: FieldSelect,
  segmented: FieldSegmented,
  toggle: FieldToggle,
  number: FieldNumber,
  range: FieldRange,
  color: FieldColor,
  url: FieldUrl,
  richtext: FieldRichText,
  image: FieldImage,
  link: FieldLink,
  cornerRadius: FieldCornerRadiusInline,
  weightRange: FieldWeightRange,
  markers: FieldMarkers,
  mapPicker: FieldMapPicker,
  video: FieldVideo,
  imageList: FieldImageList,
};

export function FieldRenderer({ field, value, onChange, allValues }: FieldRendererProps) {
  const Component = FIELD_MAP[field.type] || FieldText;
  return <Component field={field} value={value} onChange={onChange} allValues={allValues} />;
}

// ─── Field Wrapper (shared layout) ──────────────────────────

export function FieldWrapper({
  field,
  children,
}: {
  field: SettingField;
  children: React.ReactNode;
}) {
  return (
    <div className="sf-field">
      {!field.hideLabel && (
        <>
          <label className="sf-label" htmlFor={`sf-${field.key}`}>
            {field.label}
            {field.required && <span className="sf-required" aria-hidden="true">*</span>}
          </label>
          {field.description && (
            <p className="sf-desc">{field.description}</p>
          )}
        </>
      )}
      {children}
      {field.descriptionLink && (
        <a
          className="sf-desc-link"
          href={field.descriptionLink.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {field.descriptionLink.label}
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 16, verticalAlign: "middle", marginLeft: 2, fontVariationSettings: "'wght' var(--icon-weight, 400), 'FILL' 0" }}
          >
            arrow_right_alt
          </span>
        </a>
      )}
    </div>
  );
}

// ─── Settings Form ──────────────────────────────────────────

type SettingsFormProps = {
  schema: SettingField[];
  values: Record<string, unknown>;
  onChange: FieldOnChange;
};

/**
 * Renders a complete settings form from a schema.
 * Groups fields by `field.group` if present.
 */
export function SettingsForm({ schema, values, onChange }: SettingsFormProps) {
  // Group fields (skip hidden)
  const grouped = new Map<string, SettingField[]>();
  for (const field of schema) {
    if (field.hidden) continue;
    const group = field.group || "__default";
    const list = grouped.get(group) || [];
    list.push(field);
    grouped.set(group, list);
  }

  const allFields: React.ReactNode[] = [];
  for (const [group, fields] of grouped) {
    if (group !== "__default") {
      allFields.push(<div key={`gl-${group}`} className="sf-group-label">{group}</div>);
    }
    for (const field of fields) {
      allFields.push(
        <FieldRenderer
          key={field.key}
          field={field}
          value={values[field.key] ?? field.default}
          onChange={onChange}
          allValues={values}
        />
      );
    }
  }

  return <div className="sf-form">{allFields}</div>;
}
