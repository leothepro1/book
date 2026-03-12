"use client";

/**
 * ThemeConfigureView — Section settings editor for the active theme.
 *
 * Shows all configurable sections from the active theme's manifest.
 * Settings vary per theme since different themes have different sections.
 */

import { useCallback, useState } from "react";
import { usePreview } from "../_components/GuestPreview";
import { usePublishBar } from "../_components/PublishBar";
import { useDraftUpdate } from "../_hooks/useDraftUpdate";
import { getSectionConfig } from "./configRegistry";
import { validateSettingValue } from "@/app/(guest)/_lib/themes/validation";
import "./config-cards"; // Bootstrap: registers all section config cards
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { ThemeManifest, ThemeSectionSlot, SettingField } from "@/app/(guest)/_lib/themes/types";
import "./theme-configure.css";

/* ── Section type display labels ─────────────── */

const TYPE_LABEL: Record<string, string> = {
  hero: "Hero",
  "info-bar": "Infopanel",
  "quick-links": "Snabblänkar",
  "hero-slider": "Bildslider",
  "category-tabs": "Kategorier",
};

const VARIANT_LABEL: Record<string, string> = {
  contained: "Inramad",
  fullscreen: "Helskärm",
  "split-cards": "Delade kort",
  grid: "Rutnät",
  "floating-bar": "Flytande fält",
  standard: "Standard",
  pebble: "Pebble",
};

/* ── Section type icons (16×16 SVG) ──────────── */

const TYPE_ICON: Record<string, React.ReactNode> = {
  hero: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1 9l4-3 3 2 4-3 3 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "info-bar": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9" y="5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ),
  "quick-links": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="6" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="11" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="1" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="6" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ),
  "hero-slider": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="4" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1 6v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M15 6v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  ),
  "category-tabs": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="4" height="2" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="6" y="1" width="4" height="2" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="1" y="5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9" y="5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
  </svg>
);

/* ════════════════════════════════════════════
   Main Export
   ════════════════════════════════════════════ */

export function ThemeConfigureView({ manifest }: { manifest: ThemeManifest }) {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();
  const themeId = manifest.id;

  /**
   * Settings are stored with namespaced keys: "{themeId}:{slotId}"
   * This prevents settings from theme A leaking into theme B when switching.
   */
  const handleChange = useCallback(
    async (slotId: string, key: string, value: unknown) => {
      // Validate: the key must exist in the slot's schema
      const allSlots = [
        ...manifest.sectionGroups.header,
        ...manifest.sectionGroups.footer,
        ...Object.values(manifest.templates).flatMap((t) => t.sections),
      ];
      const slot = allSlots.find((s) => s.id === slotId);
      if (!slot) {
        console.error(`[ThemeConfigure] Unknown slot "${slotId}" in theme "${themeId}".`);
        return;
      }
      const field = slot.schema.find((f) => f.key === key);
      if (!field) {
        console.error(`[ThemeConfigure] Unknown setting key "${key}" for slot "${slotId}".`);
        return;
      }

      // Runtime type/range validation
      const validation = validateSettingValue(field, value);
      if (!validation.valid) {
        console.warn(`[ThemeConfigure] Validation failed: ${validation.reason}`);
        return;
      }

      const prev = config?.sectionSettings ?? {};
      const namespacedKey = `${themeId}:${slotId}`;

      pushUndo({ sectionSettings: prev } as Partial<TenantConfig>);

      const updated = {
        ...prev,
        [namespacedKey]: {
          ...(prev[namespacedKey] ?? {}),
          [key]: value,
        },
      };

      await saveDraft({ sectionSettings: updated } as Partial<TenantConfig>);
    },
    [config?.sectionSettings, pushUndo, saveDraft, themeId, manifest],
  );

  /**
   * Resolve current settings for a slot.
   * Reads from "{themeId}:{slotId}", falls back to bare "{slotId}" for backwards compat.
   */
  const resolveSettings = useCallback(
    (slotId: string): Record<string, unknown> => {
      const all = config?.sectionSettings ?? {};
      return all[`${themeId}:${slotId}`] ?? all[slotId] ?? {};
    },
    [config?.sectionSettings, themeId],
  );

  const templateEntries = Object.entries(manifest.templates);
  const hasHeaderGroup = manifest.sectionGroups.header.length > 0;
  const hasFooterGroup = manifest.sectionGroups.footer.length > 0;

  return (
    <div className="tc">
      {hasHeaderGroup && (
        <>
          <div className="tc__label">Header</div>
          <SectionList
            slots={manifest.sectionGroups.header}
            resolveSettings={resolveSettings}
            onChange={handleChange}
          />
        </>
      )}

      {templateEntries.map(([key, template]) => (
        <div key={key}>
          <div className="tc__label">{template.name} — Sektioner</div>
          <SectionList
            slots={template.sections}
            resolveSettings={resolveSettings}
            onChange={handleChange}
          />
        </div>
      ))}

      {hasFooterGroup && (
        <>
          <div className="tc__label">Footer</div>
          <SectionList
            slots={manifest.sectionGroups.footer}
            resolveSettings={resolveSettings}
            onChange={handleChange}
          />
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   Section List
   ════════════════════════════════════════════ */

function SectionList({
  slots,
  resolveSettings,
  onChange,
}: {
  slots: ThemeSectionSlot[];
  resolveSettings: (slotId: string) => Record<string, unknown>;
  onChange: (slotId: string, key: string, value: unknown) => void;
}) {
  return (
    <div className="tc__section-list">
      {[...slots]
        .sort((a, b) => a.order - b.order)
        .map((slot) => (
          <SectionRow
            key={slot.id}
            slot={slot}
            values={resolveSettings(slot.id)}
            onChange={onChange}
          />
        ))}
    </div>
  );
}

/* ════════════════════════════════════════════
   Section Row (Accordion)
   ════════════════════════════════════════════ */

function SectionRow({
  slot,
  values,
  onChange,
}: {
  slot: ThemeSectionSlot;
  values: Record<string, unknown>;
  onChange: (slotId: string, key: string, value: unknown) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasSettings = slot.schema.length > 0;

  // Check for a custom config card registered for this section type
  const CustomCard = getSectionConfig(slot.type);

  return (
    <div className="tc__section">
      <div
        className="tc__section-header"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <div className="tc__section-left">
          <div className="tc__section-icon">
            {TYPE_ICON[slot.type] || DEFAULT_ICON}
          </div>
          <div className="tc__section-text">
            <div className="tc__section-name">
              {TYPE_LABEL[slot.type] || slot.type}
            </div>
            <div className="tc__section-variant">
              {VARIANT_LABEL[slot.variant] || slot.variant}
            </div>
          </div>
        </div>
        <svg
          className={`tc__chevron ${isOpen ? "tc__chevron--open" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <div className={`tc__body ${isOpen ? "tc__body--open" : ""}`}>
        <div className="tc__body-inner">
          {CustomCard ? (
            <CustomCard
              slot={slot}
              values={values}
              onChange={(key, value) => onChange(slot.id, key, value)}
              schema={slot.schema}
            />
          ) : hasSettings ? (
            <div className="tc__fields">
              {slot.schema.map((field) => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? field.default}
                  onChange={(val) => onChange(slot.id, field.key, val)}
                />
              ))}
            </div>
          ) : (
            <div className="tc__empty">
              Denna sektion har inga konfigurerbara inställningar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Field Renderer
   ════════════════════════════════════════════ */

/**
 * Generic field renderer — renders a single schema field.
 *
 * Exported so custom config cards can compose individual fields
 * without reimplementing the switch statement.
 */
export function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "toggle":
      return (
        <div className="tc-f">
          <div className="tc-f__toggle-row">
            <div>
              <div className="tc-f__label">{field.label}</div>
              {field.description && <div className="tc-f__desc">{field.description}</div>}
            </div>
            <button
              type="button"
              className={`tc-f__switch ${value ? "tc-f__switch--on" : "tc-f__switch--off"}`}
              onClick={() => onChange(!value)}
              aria-label={field.label}
            >
              <div className="tc-f__switch-knob" />
            </button>
          </div>
        </div>
      );

    case "select":
      return (
        <div className="tc-f">
          <div className="tc-f__label">{field.label}</div>
          {field.description && <div className="tc-f__desc">{field.description}</div>}
          <select
            className="tc-f__select"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );

    case "text":
    case "url":
    case "image":
    case "video":
    case "imageList":
      return (
        <div className="tc-f">
          <div className="tc-f__label">{field.label}</div>
          {field.description && <div className="tc-f__desc">{field.description}</div>}
          <input
            type={field.type === "url" ? "url" : "text"}
            className="tc-f__input"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.type === "image" ? "https://..." : field.label}
          />
        </div>
      );

    case "textarea":
    case "richtext":
      return (
        <div className="tc-f">
          <div className="tc-f__label">{field.label}</div>
          {field.description && <div className="tc-f__desc">{field.description}</div>}
          <textarea
            className="tc-f__input"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            style={{ resize: "vertical" }}
          />
        </div>
      );

    case "number":
    case "range":
      return (
        <div className="tc-f">
          <div className="tc-f__label">{field.label}</div>
          {field.description && <div className="tc-f__desc">{field.description}</div>}
          <input
            type="number"
            className="tc-f__input"
            value={Number(value ?? field.default ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        </div>
      );

    case "color":
      return (
        <div className="tc-f">
          <div className="tc-f__label">{field.label}</div>
          {field.description && <div className="tc-f__desc">{field.description}</div>}
          <input
            type="color"
            value={String(value ?? "#000000")}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 40, height: 32, padding: 0, border: "none", cursor: "pointer", borderRadius: 4 }}
          />
        </div>
      );

    default:
      return null;
  }
}
