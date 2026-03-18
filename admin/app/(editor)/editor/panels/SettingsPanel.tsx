"use client";

/**
 * Settings Panel — Design Settings
 * ─────────────────────────────────
 * Accordion-based UI for managing tenant-level design settings:
 *   - Logo (upload via media library + width slider)
 *   - Color schemes (Shopify-style scheme management)
 *
 * Architectural invariants:
 *   - config (PreviewContext) is the single source of truth
 *   - Changes are persisted to draft immediately
 *   - Undo snapshots are pushed before every mutation
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { usePublishBar } from "@/app/(admin)/_components/PublishBar/PublishBarContext";
import { useDraftUpdate } from "@/app/(admin)/_hooks/useDraftUpdate";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import "@/app/(admin)/_components/ImageUpload/image-upload.css";
import {
  collectReferencedSchemeIds,
  nextSchemeSequence,
} from "@/app/_lib/color-schemes";
import type { ColorScheme, ColorSchemeTokens } from "@/app/_lib/color-schemes";
import { FONT_CATALOG, batchFontsUrl } from "@/app/_lib/fonts/catalog";
import { FieldSpacing } from "../fields/FieldSpacing";
import { ColorTokenField } from "./ColorTokenField";
import { useEditor } from "../EditorContext";

// ─── Font helpers ─────────────────────────────────────────────

const FONTS_PER_PAGE = 30;

const FONT_OPTIONS = FONT_CATALOG.map((f) => ({
  key: f.key,
  label: f.label,
  family: `${f.label}, ${f.serif ? "serif" : "sans-serif"}`,
}));

const INITIAL_BATCH_URL = batchFontsUrl(FONT_CATALOG.slice(0, FONTS_PER_PAGE));

// ─── Constants ────────────────────────────────────────────────

const NEW_SCHEME_DEFAULTS: ColorSchemeTokens = {
  background: "#ffffff",
  text: "#121212",
  solidButtonBackground: "#121212",
  solidButtonLabel: "#ffffff",
  outlineButton: "#121212",
  outlineButtonLabel: "#121212",
};

const TOKEN_LABELS: Record<keyof ColorSchemeTokens, string> = {
  background: "Bakgrund",
  text: "Text",
  solidButtonBackground: "Knapp — bakgrund",
  solidButtonLabel: "Knapp — text",
  outlineButton: "Konturknapp — ram",
  outlineButtonLabel: "Konturknapp — text",
};

const TOKEN_ORDER: (keyof ColorSchemeTokens)[] = [
  "background",
  "text",
  "solidButtonBackground",
  "solidButtonLabel",
  "outlineButton",
  "outlineButtonLabel",
];

function generateSchemeId(): string {
  return "cs_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Derive the display label from a scheme's sequence number. */
export function schemeLabel(scheme: ColorScheme): string {
  return `Schema ${scheme.sequence}`;
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════

export function SettingsPanel() {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();
  const { settingsAccordion } = useEditor();

  const schemes: ColorScheme[] = config?.colorSchemes ?? [];
  const defaultSchemeId = config?.defaultColorSchemeId ?? null;

  // null = list view, string = ID of scheme being edited
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null);

  // Collect all scheme IDs referenced by any section across entire config
  const referencedSchemeIds = useMemo(
    () => (config ? collectReferencedSchemeIds(config) : new Set<string>()),
    [config],
  );

  // Determine which schemes cannot be deleted
  const undeletableSchemeIds = useMemo(() => {
    const ids = new Set(referencedSchemeIds);
    if (defaultSchemeId) ids.add(defaultSchemeId);
    return ids;
  }, [referencedSchemeIds, defaultSchemeId]);

  // Persist helper: snapshot undo, save changes
  const persistChanges = useCallback(
    async (changes: { colorSchemes?: ColorScheme[]; defaultColorSchemeId?: string }) => {
      if (!config) return;
      const undoSnapshot: Record<string, unknown> = {};
      if (changes.colorSchemes !== undefined) undoSnapshot.colorSchemes = config.colorSchemes ?? [];
      if (changes.defaultColorSchemeId !== undefined) undoSnapshot.defaultColorSchemeId = config.defaultColorSchemeId;
      pushUndo(undoSnapshot);
      await saveDraft(changes);
    },
    [config, pushUndo, saveDraft],
  );

  const handleAddScheme = useCallback(async () => {
    const seq = nextSchemeSequence(schemes);
    const scheme: ColorScheme = {
      id: generateSchemeId(),
      sequence: seq,
      tokens: { ...NEW_SCHEME_DEFAULTS },
    };
    const isFirst = schemes.length === 0;
    const changes: { colorSchemes: ColorScheme[]; defaultColorSchemeId?: string } = {
      colorSchemes: [...schemes, scheme],
    };
    // First scheme becomes the default
    if (isFirst) {
      changes.defaultColorSchemeId = scheme.id;
    }
    setEditingSchemeId(scheme.id);
    await persistChanges(changes);
  }, [schemes, persistChanges]);

  const handleEditScheme = useCallback((id: string) => {
    setEditingSchemeId(id);
  }, []);

  const handleBack = useCallback(() => {
    setEditingSchemeId(null);
  }, []);

  const handleUpdateScheme = useCallback(
    async (updated: ColorScheme) => {
      const newList = schemes.map((s) => (s.id === updated.id ? updated : s));
      await persistChanges({ colorSchemes: newList });
    },
    [schemes, persistChanges],
  );

  const handleDeleteScheme = useCallback(
    async (schemeId: string) => {
      if (undeletableSchemeIds.has(schemeId)) return;
      const newList = schemes.filter((s) => s.id !== schemeId);
      await persistChanges({ colorSchemes: newList });
      setEditingSchemeId(null);
    },
    [schemes, undeletableSchemeIds, persistChanges],
  );

  const handleSetDefault = useCallback(
    async (schemeId: string) => {
      if (schemeId === defaultSchemeId) return;
      await persistChanges({ defaultColorSchemeId: schemeId });
    },
    [defaultSchemeId, persistChanges],
  );

  // ── Editor view ──

  if (editingSchemeId) {
    const scheme = schemes.find((s) => s.id === editingSchemeId);
    if (scheme) {
      const isDefault = scheme.id === defaultSchemeId;
      const isUndeletable = undeletableSchemeIds.has(scheme.id);
      const deleteReason = isDefault
        ? "Standardschemat kan inte tas bort"
        : referencedSchemeIds.has(scheme.id)
          ? "Schemat används av en eller flera sektioner"
          : null;

      return (
        <SchemeEditor
          scheme={scheme}
          isDefault={isDefault}
          isUndeletable={isUndeletable}
          deleteReason={deleteReason}
          onBack={handleBack}
          onUpdate={handleUpdateScheme}
          onDelete={handleDeleteScheme}
          onSetDefault={handleSetDefault}
        />
      );
    }
  }

  // ── List view ──
  return (
    <>
      <div className="editor-panel__header">
        <span className="editor-panel__title">Inställningar</span>
      </div>
      <div className="editor-panel__body">
        <LogoAccordion />
        <TypographyAccordion />
        <ButtonsAccordion />
        <ColorSchemesAccordion
          schemes={schemes}
          defaultSchemeId={defaultSchemeId}
          onEdit={handleEditScheme}
          onAdd={handleAddScheme}
          autoOpen={settingsAccordion === "colors"}
        />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGO ACCORDION
// ═══════════════════════════════════════════════════════════════

function LogoAccordion() {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();

  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const theme = config?.theme as Record<string, any> | undefined;
  const logoUrl: string = theme?.header?.logoUrl || "";
  const logoWidth: number = theme?.header?.logoWidth ?? 120;

  const [localWidth, setLocalWidth] = useState(logoWidth);
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Sync local width from config
  const prevWidth = useRef(logoWidth);
  if (logoWidth !== prevWidth.current) {
    prevWidth.current = logoWidth;
    setLocalWidth(logoWidth);
  }

  const snapshotHeader = useCallback(
    () => ({ theme: { header: { ...theme?.header } } } as any),
    [theme?.header],
  );

  const handleLogoSelect = useCallback(
    (asset: MediaLibraryResult) => {
      pushUndo(snapshotHeader());
      saveDraft({ theme: { header: { logoUrl: asset.url } } } as any);
      setLibraryOpen(false);
    },
    [pushUndo, snapshotHeader, saveDraft],
  );

  const handleLogoRemove = useCallback(() => {
    pushUndo(snapshotHeader());
    saveDraft({ theme: { header: { logoUrl: "" } } } as any);
  }, [pushUndo, snapshotHeader, saveDraft]);

  const handleWidthChange = useCallback(
    (value: number) => {
      setLocalWidth(value);
      if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
      widthTimerRef.current = setTimeout(() => {
        pushUndo(snapshotHeader());
        saveDraft({ theme: { header: { logoWidth: value } } } as any);
      }, 300);
    },
    [pushUndo, snapshotHeader, saveDraft],
  );

  // ── Range slider logic (mirrors FieldRange) ──
  const min = 40, max = 300, step = 1, unit = "px";
  const displayValue = localWidth;
  const pct = ((displayValue - min) / (max - min)) * 100;

  const resolve = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return displayValue;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      return Math.max(min, Math.min(max, Math.round(raw / step) * step));
    },
    [displayValue],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      const v = resolve(e.clientX);
      setLocalWidth(v);
      handleWidthChange(v);
    },
    [resolve, handleWidthChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const v = resolve(e.clientX);
      setLocalWidth(v);
      handleWidthChange(v);
    },
    [dragging, resolve, handleWidthChange],
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  return (
    <div className="dp-accordion">
      <button
        type="button"
        className="dp-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-accordion__label">Logotyp</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron ${open ? "dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-accordion__content">
          {/* Upload widget */}
          <span className="cs-section-label">Logotyp</span>
          {logoUrl ? (
            <div className="img-upload">
              <div className="img-upload-result">
                <div className="img-upload-result-thumb">
                  <img src={logoUrl} alt="" className="img-upload-result-img" />
                </div>
                <div className="img-upload-result-meta">
                  <span className="img-upload-result-filename">
                    {logoUrl.split("/").pop() || "logotyp"}
                  </span>
                  <button
                    type="button"
                    className="img-upload-replace-btn"
                    onClick={() => setLibraryOpen(true)}
                  >
                    Ändra
                  </button>
                </div>
                <button
                  type="button"
                  className="img-upload-trash-btn"
                  onClick={handleLogoRemove}
                  aria-label="Ta bort logotyp"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="img-upload">
              <div
                className="img-upload-empty"
                onClick={() => setLibraryOpen(true)}
                style={{ cursor: "pointer" }}
              >
                <span className="img-upload-btn">Ladda upp logotyp</span>
              </div>
            </div>
          )}

          {/* Width slider */}
          {logoUrl && (
            <div style={{ marginTop: 16 }}>
              <span className="cs-section-label">Bredd</span>
              <div className="sf-range-row" style={{ marginTop: 8 }}>
                <div
                  ref={trackRef}
                  className="sf-range__track"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <div className="sf-range__fill" style={{ width: `${pct}%` }} />
                  <div className={`sf-range__thumb${dragging ? " sf-range__thumb--active" : ""}`} style={{ left: `${pct}%` }}>
                    <div className="sf-range__pin">
                      <span className="sf-range__pin-value">{displayValue}{unit}</span>
                    </div>
                  </div>
                </div>
                <div className="sf-range-input-wrap">
                  <input
                    type="number"
                    className="sf-range-input"
                    value={displayValue}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!isNaN(v)) handleWidthChange(Math.min(max, Math.max(min, v)));
                    }}
                  />
                  <span className="sf-range-unit">{unit}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <MediaLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onConfirm={handleLogoSelect}
        currentValue={logoUrl}
        uploadFolder="logos"
        accept="image"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TYPOGRAPHY ACCORDION
// ═══════════════════════════════════════════════════════════════

const FONT_TARGET_LABELS: Record<string, string> = {
  heading: "Rubriker",
  body: "Brödtext",
  button: "Knappar",
};

function TypographyAccordion() {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();

  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState<"heading" | "body" | "button" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    if (panelRef.current) {
      setPortalTarget(panelRef.current.closest(".editor-panel"));
    }
  }, []);

  const theme = config?.theme as Record<string, any> | undefined;
  const headingFont = theme?.typography?.headingFont || "inter";
  const headingLabel = FONT_OPTIONS.find(f => f.key === headingFont)?.label || "Inter";
  const headingFamily = FONT_OPTIONS.find(f => f.key === headingFont)?.family || "Inter, sans-serif";

  const bodyFont = theme?.typography?.bodyFont || headingFont;
  const bodyLabel = FONT_OPTIONS.find(f => f.key === bodyFont)?.label || headingLabel;
  const bodyFamily = FONT_OPTIONS.find(f => f.key === bodyFont)?.family || headingFamily;

  const buttonFont = theme?.typography?.buttonFont;
  const hasCustomButtonFont = !!buttonFont;
  const buttonFontLabel = buttonFont ? (FONT_OPTIONS.find(f => f.key === buttonFont)?.label || headingLabel) : headingLabel;
  const buttonFontFamily = buttonFont ? (FONT_OPTIONS.find(f => f.key === buttonFont)?.family || headingFamily) : headingFamily;

  const snapshotTypography = useCallback(
    () => ({ theme: { typography: { ...theme?.typography } } } as any),
    [theme?.typography],
  );

  const handleFontSelect = useCallback((fontKey: string) => {
    const target = showPicker;
    pushUndo(snapshotTypography());
    setShowPicker(null);
    if (target === "heading") {
      saveDraft({ theme: { typography: { headingFont: fontKey } } } as any);
    } else if (target === "body") {
      saveDraft({ theme: { typography: { bodyFont: fontKey } } } as any);
    } else if (target === "button") {
      saveDraft({ theme: { typography: { buttonFont: fontKey } } } as any);
    }
  }, [showPicker, pushUndo, snapshotTypography, saveDraft]);

  const handleButtonFontToggle = useCallback(() => {
    pushUndo(snapshotTypography());
    if (hasCustomButtonFont) {
      saveDraft({ theme: { typography: { buttonFont: null } } } as any);
    } else {
      saveDraft({ theme: { typography: { buttonFont: headingFont } } } as any);
    }
  }, [hasCustomButtonFont, headingFont, pushUndo, snapshotTypography, saveDraft]);

  const pickerElement = showPicker ? (
    <InPanelFontPicker
      title={`Välj typsnitt för ${FONT_TARGET_LABELS[showPicker]?.toLowerCase()}`}
      currentFont={showPicker === "heading" ? headingFont : showPicker === "body" ? bodyFont : (buttonFont || headingFont)}
      onSelect={handleFontSelect}
      onClose={() => setShowPicker(null)}
    />
  ) : null;

  return (
    <div className="dp-accordion" ref={panelRef}>
      <button
        type="button"
        className="dp-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-accordion__label">Typsnitt</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron ${open ? "dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-accordion__content">
          {/* Heading font */}
          <div className="sp-typo-field">
            <span className="cs-section-label">Rubriker</span>
            <button type="button" className="sp-font-selector" onClick={() => setShowPicker("heading")}>
              <span className="sp-font-selector__name" style={{ fontFamily: headingFamily }}>{headingLabel}</span>
              <span className="sp-font-selector__chevron"><EditorIcon name="chevron_right" size={18} /></span>
            </button>
          </div>

          {/* Body font */}
          <div className="sp-typo-field">
            <span className="cs-section-label">Brödtext</span>
            <button type="button" className="sp-font-selector" onClick={() => setShowPicker("body")}>
              <span className="sp-font-selector__name" style={{ fontFamily: bodyFamily }}>{bodyLabel}</span>
              <span className="sp-font-selector__chevron"><EditorIcon name="chevron_right" size={18} /></span>
            </button>
          </div>

          {/* Custom button font toggle */}
          <div className="sp-typo-field">
            <div className="sf-toggle-row">
              <div>
                <span className="cs-section-label">Knappar</span>
                <p className="cs-description" style={{ marginTop: 2 }}>
                  Knappar ärver titeltypsnitt som standard
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hasCustomButtonFont}
                className={`sf-toggle${hasCustomButtonFont ? " sf-toggle--on" : ""}`}
                onClick={handleButtonFontToggle}
              >
                <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
                <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
                <span className="sf-toggle__thumb" />
              </button>
            </div>
            {hasCustomButtonFont && (
              <button type="button" className="sp-font-selector" style={{ marginTop: 8 }} onClick={() => setShowPicker("button")}>
                <span className="sp-font-selector__name" style={{ fontFamily: buttonFontFamily }}>{buttonFontLabel}</span>
                <span className="sp-font-selector__chevron"><EditorIcon name="chevron_right" size={18} /></span>
              </button>
            )}
          </div>
        </div>
      )}
      {pickerElement && portalTarget
        ? createPortal(pickerElement, portalTarget)
        : pickerElement}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BUTTONS ACCORDION
// ═══════════════════════════════════════════════════════════════

function ButtonsAccordion() {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();

  const [open, setOpen] = useState(false);

  const theme = config?.theme as Record<string, any> | undefined;
  const buttons = theme?.buttons ?? {};

  // Radius: prefer radiusPx, fall back from enum
  const RADIUS_ENUM_MAP: Record<string, number> = {
    square: 0, rounded: 8, round: 12, rounder: 16, full: 50,
  };
  const radiusPx: number = buttons.radiusPx ?? RADIUS_ENUM_MAP[buttons.radius] ?? 16;

  // Padding
  const padding = buttons.padding ?? { top: 11, right: 22, bottom: 11, left: 22 };

  const [localRadius, setLocalRadius] = useState(radiusPx);
  const radiusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Sync local radius from config
  const prevRadius = useRef(radiusPx);
  if (radiusPx !== prevRadius.current) {
    prevRadius.current = radiusPx;
    setLocalRadius(radiusPx);
  }

  const snapshotButtons = useCallback(
    () => ({ theme: { buttons: { ...buttons } } } as any),
    [buttons],
  );

  const handleRadiusChange = useCallback(
    (value: number) => {
      setLocalRadius(value);
      if (radiusTimerRef.current) clearTimeout(radiusTimerRef.current);
      radiusTimerRef.current = setTimeout(() => {
        pushUndo(snapshotButtons());
        saveDraft({ theme: { buttons: { radiusPx: value } } } as any);
      }, 300);
    },
    [pushUndo, snapshotButtons, saveDraft],
  );

  const PADDING_KEY_MAP: Record<string, string> = {
    paddingTop: "top", paddingRight: "right", paddingBottom: "bottom", paddingLeft: "left",
  };

  const handlePaddingChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: number) => {
      pushUndo(snapshotButtons());
      if (typeof keyOrPatch === "string") {
        const mapped = PADDING_KEY_MAP[keyOrPatch] || keyOrPatch;
        saveDraft({ theme: { buttons: { padding: { ...padding, [mapped]: value } } } } as any);
      } else {
        const p = { ...padding };
        if ("paddingTop" in keyOrPatch) p.top = keyOrPatch.paddingTop as number;
        if ("paddingRight" in keyOrPatch) p.right = keyOrPatch.paddingRight as number;
        if ("paddingBottom" in keyOrPatch) p.bottom = keyOrPatch.paddingBottom as number;
        if ("paddingLeft" in keyOrPatch) p.left = keyOrPatch.paddingLeft as number;
        saveDraft({ theme: { buttons: { padding: p } } } as any);
      }
    },
    [pushUndo, snapshotButtons, saveDraft, padding],
  );

  // FieldSpacing uses paddingTop/Right/Bottom/Left keys
  const spacingOnChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: number) => {
      handlePaddingChange(keyOrPatch, value);
    },
    [handlePaddingChange],
  );

  // ── Range slider logic ──
  const min = 0, max = 50, step = 1, unit = "px";
  const pct = ((localRadius - min) / (max - min)) * 100;

  const resolve = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return localRadius;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      return Math.max(min, Math.min(max, Math.round(raw / step) * step));
    },
    [localRadius],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      const v = resolve(e.clientX);
      setLocalRadius(v);
      handleRadiusChange(v);
    },
    [resolve, handleRadiusChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const v = resolve(e.clientX);
      setLocalRadius(v);
      handleRadiusChange(v);
    },
    [dragging, resolve, handleRadiusChange],
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  return (
    <div className="dp-accordion">
      <button
        type="button"
        className="dp-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-accordion__label">Knappar</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron ${open ? "dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-accordion__content">
          {/* Border radius slider */}
          <span className="cs-section-label">Hörnradie</span>
          <div className="sf-range-row" style={{ marginTop: 8 }}>
            <div
              ref={trackRef}
              className="sf-range__track"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="sf-range__fill" style={{ width: `${pct}%` }} />
              <div className={`sf-range__thumb${dragging ? " sf-range__thumb--active" : ""}`} style={{ left: `${pct}%` }}>
                <div className="sf-range__pin">
                  <span className="sf-range__pin-value">{localRadius}{unit}</span>
                </div>
              </div>
            </div>
            <div className="sf-range-input-wrap">
              <input
                type="number"
                className="sf-range-input"
                value={localRadius}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!isNaN(v)) handleRadiusChange(Math.min(max, Math.max(min, v)));
                }}
              />
              <span className="sf-range-unit">{unit}</span>
            </div>
          </div>

          {/* Padding (pizza slice) */}
          <div style={{ marginTop: 16 }}>
            <span className="cs-section-label">Avstånd</span>
            <div style={{ marginTop: 8 }}>
              <FieldSpacing
                paddingTop={padding.top}
                paddingRight={padding.right}
                paddingBottom={padding.bottom}
                paddingLeft={padding.left}
                onChange={spacingOnChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── In-Panel Font Picker ─────────────────────────────────────

function InPanelFontPicker({ title, currentFont, onSelect, onClose }: {
  title: string;
  currentFont: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(FONTS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const loadedUrlsRef = useRef<Set<string>>(new Set(INITIAL_BATCH_URL ? [INITIAL_BATCH_URL] : []));

  const isSearching = search.trim().length > 0;

  const searchResults = isSearching
    ? FONT_OPTIONS.filter(f => f.label.toLowerCase().includes(search.trim().toLowerCase()))
    : null;

  const displayFonts = searchResults ?? FONT_OPTIONS.slice(0, visibleCount);
  const hasMore = !isSearching && visibleCount < FONT_OPTIONS.length;

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const loadFontsForSearch = useCallback((fonts: typeof FONT_OPTIONS) => {
    const catalogEntries = fonts.map(f => FONT_CATALOG.find(c => c.key === f.key)!).filter(Boolean);
    const url = batchFontsUrl(catalogEntries);
    if (!url || loadedUrlsRef.current.has(url)) return;
    loadedUrlsRef.current.add(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, []);

  if (searchResults && searchResults.length > 0) {
    loadFontsForSearch(searchResults);
  }

  const handleShowMore = useCallback(() => {
    setLoadingMore(true);
    const nextEnd = Math.min(visibleCount + FONTS_PER_PAGE, FONT_CATALOG.length);
    const batch = FONT_CATALOG.slice(visibleCount, nextEnd);
    const url = batchFontsUrl(batch);

    if (url && !loadedUrlsRef.current.has(url)) {
      loadedUrlsRef.current.add(url);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = () => { setVisibleCount(nextEnd); setLoadingMore(false); };
      link.onerror = () => { setVisibleCount(nextEnd); setLoadingMore(false); };
      document.head.appendChild(link);
    } else {
      setVisibleCount(nextEnd);
      setLoadingMore(false);
    }
  }, [visibleCount]);

  return (
    <div className="sp-font-overlay">
      {INITIAL_BATCH_URL && <link rel="stylesheet" href={INITIAL_BATCH_URL} />}

      {/* Header: back chevron + title */}
      <div className="sp-font-header">
        <button type="button" className="sp-font-header__back" onClick={onClose} aria-label="Tillbaka">
          <EditorIcon name="chevron_left" size={18} />
        </button>
        <span className="sp-font-header__title">{title}</span>
      </div>

      {/* Search */}
      <div className="sp-font-search">
        <div className="sp-font-search__wrap">
          <svg className="sp-font-search__icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            className="sp-font-search__input"
            placeholder="Sök typsnitt..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Font list */}
      <div className="sp-font-list">
        {displayFonts.map(({ key, label, family }) => (
          <button
            key={key}
            type="button"
            className="sp-font-item"
            onClick={() => onSelect(key)}
            style={{ fontFamily: family }}
          >
            <span>{label}</span>
            {currentFont === key && (
              <span className="sp-font-item__check material-symbols-rounded">check</span>
            )}
          </button>
        ))}
        {isSearching && displayFonts.length === 0 && (
          <div className="sp-font-empty">Inga typsnitt hittades</div>
        )}
        {hasMore && (
          <div className="sp-font-load-more">
            <button type="button" className="sp-font-load-more__btn" onClick={handleShowMore} disabled={loadingMore}>
              Visa fler
            </button>
            <span className="sp-font-load-more__count">Visar {visibleCount} av {FONT_OPTIONS.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COLOR SCHEMES ACCORDION
// ═══════════════════════════════════════════════════════════════

function ColorSchemesAccordion({
  schemes,
  defaultSchemeId,
  onEdit,
  onAdd,
  autoOpen,
}: {
  schemes: ColorScheme[];
  defaultSchemeId: string | null;
  onEdit: (id: string) => void;
  onAdd: () => void;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  return (
    <div className="dp-accordion">
      <button
        type="button"
        className="dp-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-accordion__label">Färger</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron ${open ? "dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-accordion__content">
          <span className="cs-section-label">Scheman</span>
          <p className="cs-description">
            Färgscheman kan tillämpas på sektioner i hela din gästportal
          </p>
          <div className="cs-grid">
            {schemes.map((scheme) => (
              <SchemePreviewCard
                key={scheme.id}
                scheme={scheme}
                isDefault={scheme.id === defaultSchemeId}
                onClick={() => onEdit(scheme.id)}
              />
            ))}
            <div className="cs-preview-wrapper">
              <button
                type="button"
                className="cs-add-tile"
                onClick={onAdd}
              >
                <EditorIcon name="add" size={20} />
              </button>
              <span className="cs-preview__name">Lägg till</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEME PREVIEW CARD
// ═══════════════════════════════════════════════════════════════

function SchemePreviewCard({
  scheme,
  isDefault,
  onClick,
}: {
  scheme: ColorScheme;
  isDefault: boolean;
  onClick: () => void;
}) {
  const t = scheme.tokens;
  const label = schemeLabel(scheme);

  return (
    <div className="cs-preview-wrapper">
      <button
        type="button"
        className={`cs-preview${isDefault ? " cs-preview--default" : ""}`}
        style={{ background: t.background }}
        onClick={onClick}
        title={isDefault ? `${label} (standard)` : label}
      >
        {/* "Aa" — text token */}
        <span className="cs-preview__text" style={{ color: t.text }}>
          Aa
        </span>

        {/* Solid + outline button miniatures */}
        <span className="cs-preview__buttons">
          <span
            className="cs-preview__btn-solid"
            style={{ background: t.solidButtonBackground }}
          />
          <span
            className="cs-preview__btn-outline"
            style={{ borderColor: t.outlineButton }}
          />
        </span>
      </button>
      <span className="cs-preview__name">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEME EDITOR
// ═══════════════════════════════════════════════════════════════

function SchemeEditor({
  scheme,
  isDefault,
  isUndeletable,
  deleteReason,
  onBack,
  onUpdate,
  onDelete,
  onSetDefault,
}: {
  scheme: ColorScheme;
  isDefault: boolean;
  isUndeletable: boolean;
  deleteReason: string | null;
  onBack: () => void;
  onUpdate: (scheme: ColorScheme) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
}) {
  const label = schemeLabel(scheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleTokenChange = useCallback(
    (tokenKey: keyof ColorSchemeTokens, value: string) => {
      onUpdate({
        ...scheme,
        tokens: { ...scheme.tokens, [tokenKey]: value },
      });
    },
    [scheme, onUpdate],
  );

  return (
    <div className="cs-editor">
      <div className="cs-editor__header">
        <button
          type="button"
          className="dp-header__back"
          onClick={onBack}
          aria-label="Tillbaka"
        >
          <EditorIcon name="arrow_back" size={18} />
        </button>
        <span className="dp-header__title">{label}</span>
        {isDefault && <span className="cs-editor__badge">Standard</span>}
        <div style={{ position: "relative" }}>
          <button
            ref={menuBtnRef}
            type="button"
            className="dp-header__menu"
            aria-label="Fler alternativ"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4 8a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
              <path d="M9.5 8a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
              <path d="M13.5 9.5a1.5 1.5 0 1 0-.001-3.001 1.5 1.5 0 0 0 .001 3.001" />
            </svg>
          </button>
          {menuOpen && (
            <div ref={menuRef} className="cs-popover">
              <button
                type="button"
                className="cs-popover__item"
                disabled={isDefault}
                onClick={() => {
                  onSetDefault(scheme.id);
                  setMenuOpen(false);
                }}
              >
                <EditorIcon name="check" size={20} />
                <span>Ange som standard</span>
              </button>
              <button
                type="button"
                className="cs-popover__item cs-popover__item--danger"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteConfirm(true);
                }}
              >
                <EditorIcon name="delete" size={20} />
                <span>Ta bort</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="dp-divider" />

      <div className="cs-editor__body">
        {TOKEN_ORDER.map((tokenKey) => (
          <ColorTokenField
            key={tokenKey}
            label={TOKEN_LABELS[tokenKey]}
            value={scheme.tokens[tokenKey]}
            onChange={(hex) => handleTokenChange(tokenKey, hex)}
          />
        ))}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && createPortal(
        <>
          <div className="sp-modal-backdrop" onClick={() => setDeleteConfirm(false)} />
          <div className="sp-modal" role="alertdialog" aria-labelledby="cs-delete-title">
            <h3 className="sp-modal__title" id="cs-delete-title">
              Ta bort &ldquo;{label}&rdquo;?
            </h3>
            <p className="sp-modal__desc">
              {isUndeletable && deleteReason
                ? `${deleteReason}. Schemat kan inte tas bort.`
                : "Schemat och alla dess färginställningar tas bort permanent."}
            </p>
            <div className="sp-modal__actions">
              <button
                type="button"
                className="sp-modal__btn sp-modal__btn--cancel"
                onClick={() => setDeleteConfirm(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className="sp-modal__btn sp-modal__btn--danger"
                disabled={isUndeletable}
                onClick={() => {
                  setDeleteConfirm(false);
                  onDelete(scheme.id);
                }}
              >
                Ta bort
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
