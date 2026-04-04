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

import { useState, useRef, useEffect } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
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
import { FieldLayoutPicker } from "./FieldLayoutPicker";
import { FieldMenuPicker } from "./FieldMenuPicker";
import { FieldCollectionPicker } from "./FieldCollectionPicker";
import { FieldProductPicker } from "./FieldProductPicker";
import { FieldAccommodationPicker } from "./FieldAccommodationPicker";
import { FieldFontPicker } from "./FieldFontPicker";

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
  layoutPicker: FieldLayoutPicker,
  menuPicker: FieldMenuPicker,
  collectionPicker: FieldCollectionPicker,
  productPicker: FieldProductPicker,
  accommodationPicker: FieldAccommodationPicker,
  fontPicker: FieldFontPicker,
};

export function FieldRenderer({ field, value, onChange, allValues }: FieldRendererProps) {
  const Component = FIELD_MAP[field.type] || FieldText;
  return <Component field={field} value={value} onChange={onChange} allValues={allValues} />;
}

// ─── Field Wrapper (shared layout) ──────────────────────────

function FieldTooltip({ text, anchorRef }: { text: string; anchorRef: React.RefObject<HTMLButtonElement | null> }) {
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const TIP_W = 240;

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;

    // Position tooltip: right-aligned with anchor, clamped to viewport
    let left = anchorCenterX - TIP_W + 20;
    if (left < 8) left = 8;
    if (left + TIP_W > window.innerWidth - 8) left = window.innerWidth - TIP_W - 8;

    // Arrow points at anchor center
    const arrowLeft = anchorCenterX - left;

    setPos({ top: rect.bottom + 8, left, arrowLeft });
  }, [anchorRef]);

  return (
    <div
      ref={tipRef}
      className="sf-tooltip"
      style={pos ? { top: pos.top, left: pos.left, width: TIP_W } : { visibility: "hidden" as const }}
    >
      <div className="sf-tooltip__arrow" style={pos ? { left: pos.arrowLeft } : undefined} />
      <p className="sf-tooltip__text">{text}</p>
    </div>
  );
}

export function FieldWrapper({
  field,
  children,
}: {
  field: SettingField;
  children: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showTooltip) return;
    const handle = (e: MouseEvent) => {
      if (tooltipBtnRef.current && !tooltipBtnRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showTooltip]);

  return (
    <div className="sf-field">
      {!field.hideLabel && (
        <>
          <div className="sf-label-row">
            <label className="sf-label" htmlFor={`sf-${field.key}`}>
              {field.label}
              {field.required && <span className="sf-required" aria-hidden="true">*</span>}
            </label>
            {field.tooltip && (
              <button
                ref={tooltipBtnRef}
                type="button"
                className="sf-tooltip-btn"
                onClick={() => setShowTooltip(!showTooltip)}
                aria-label="Hjälp"
              >
                <EditorIcon name="help" size={16} />
              </button>
            )}
          </div>
          {field.description && (
            <p className="sf-desc">{field.description}</p>
          )}
        </>
      )}
      {children}
      {showTooltip && field.tooltip && (
        <FieldTooltip text={field.tooltip} anchorRef={tooltipBtnRef} />
      )}
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
  // Group fields (skip hidden + visibleWhen guard)
  const grouped = new Map<string, SettingField[]>();
  for (const field of schema) {
    if (field.hidden) continue;
    if (field.visibleWhen && values[field.visibleWhen.key] !== field.visibleWhen.value) continue;
    const group = field.group || "__default";
    const list = grouped.get(group) || [];
    list.push(field);
    grouped.set(group, list);
  }

  const allFields: React.ReactNode[] = [];
  let groupIndex = 0;
  for (const [group, fields] of grouped) {
    if (group !== "__default") {
      if (groupIndex > 0) {
        allFields.push(<div key={`gd-${group}`} className="sf-group-divider" />);
      }
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
    groupIndex++;
  }

  return <div className="sf-form">{allFields}</div>;
}
