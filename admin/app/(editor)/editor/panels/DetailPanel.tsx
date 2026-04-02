"use client";

/**
 * Detail Panel — Configuration + Content Tree Navigation
 * ═══════════════════════════════════════════════════════
 *
 * Three-level drill-down matching the section hierarchy:
 *
 *   SECTION LEVEL:
 *   ┌──────────────────────────────────┐
 *   │ ← Back   Section Name     • • • │
 *   ├──────────────────────────────────┤
 *   │ [Section settings form]         │
 *   │                                  │
 *   │ ── INNEHÅLL ───────────────────  │
 *   │ ┌ Block: Slide ─────────────┐   │
 *   │ │ media                      │   │
 *   │ │   🖼 Image              →  │   │
 *   │ │ content                    │   │
 *   │ │   H  Rubrik             →  │   │
 *   │ │   ¶  Beskrivningstext   →  │   │
 *   │ │ actions                    │   │
 *   │ │   ⊡  Boka nu            →  │   │
 *   │ └───────────────────────────┘   │
 *   └──────────────────────────────────┘
 *
 *   BLOCK LEVEL:
 *   ┌──────────────────────────────────┐
 *   │ ← Back   Block Name       • • • │
 *   ├──────────────────────────────────┤
 *   │ [Block settings form]           │
 *   │                                  │
 *   │ ── ELEMENT ────────────────────  │
 *   │   H  Rubrik                   →  │
 *   │   ¶  Beskrivningstext         →  │
 *   │   ⊡  Boka nu                  →  │
 *   └──────────────────────────────────┘
 *
 *   ELEMENT LEVEL:
 *   ┌──────────────────────────────────┐
 *   │ ← Back   Rubrik           • • • │
 *   ├──────────────────────────────────┤
 *   │ Text*           [Rubrik     ]   │
 *   │ Storlek         [H2 — Stor ▾]   │
 *   │ Justering       [Center    ▾]   │
 *   └──────────────────────────────────┘
 *
 * CSS prefixes: dp-* (detail panel), ct-* (content tree)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, type DetailTarget } from "../EditorContext";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { usePublishBar } from "@/app/(admin)/_components/PublishBar";
import { useDraftUpdate } from "@/app/(admin)/_hooks/useDraftUpdate";
import { SettingsForm } from "../fields";
import type { FieldOnChange } from "../fields/FieldRenderer";
import { FieldSpacing } from "../fields/FieldSpacing";
import { SegmentedControl } from "../fields/FieldSegmented";
import { FieldMenuPicker } from "../fields/FieldMenuPicker";
import { FieldSelect } from "../fields/FieldSelect";
import { FieldSchedule } from "../fields/FieldSchedule";
import { ColorSchemeSelect } from "./ColorSchemeSelect";
import {
  getElementDefinition,
  getSectionDefinition,
  ensureSectionsRegistered,
} from "@/app/_lib/sections/registry";
import { isStandaloneSection } from "@/app/_lib/sections/mutations";
import { EditorIcon } from "@/app/_components/EditorIcon";
import type {
  SectionInstance,
  BlockInstance,
  ElementInstance,
  SettingField,
  BlockTypeDefinition,
  SlotDefinition,
} from "@/app/_lib/sections/types";
import type { HeaderConfig } from "@/app/(guest)/_lib/tenant/types";
import { HEADER_DEFAULTS, PAGE_FOOTER_DEFAULTS } from "@/app/(guest)/_lib/tenant/types";
import type { PageFooterConfig } from "@/app/(guest)/_lib/tenant/types";
import {
  getPageSections,
  getPageHeader,
  getPageFooter,
  getPageUndoSnapshot,
  buildSectionsPatch,
  buildHeaderPatch,
  buildFooterPatch,
} from "@/app/_lib/pages/config";

// ─── Main Component ─────────────────────────────────────────

export function DetailPanel() {
  const { detailTarget, goBack, openDetail, currentPageId } = useEditor();
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();
  const [registryReady, setRegistryReady] = useState(false);

  useEffect(() => {
    ensureSectionsRegistered().then(() => setRegistryReady(true));
  }, []);

  const sections: SectionInstance[] = useMemo(
    () => getPageSections(config, currentPageId),
    [config, currentPageId],
  );

  // Resolve what we're editing (body sections only)
  const resolved = useMemo(() => {
    if (!detailTarget || detailTarget.scope === "header" || !registryReady) return null;
    return resolveTarget(detailTarget, sections);
  }, [detailTarget, sections, registryReady]);

  // ── Shared patch splitter ─────────────────────────────────
  // Separates schedule fields (instance-level) from settings fields.

  const INSTANCE_KEYS = useMemo(() => new Set(["scheduledShow", "scheduledHide"]), []);

  function splitPatch(keyOrPatch: string | Record<string, unknown>, value?: unknown) {
    const fullPatch: Record<string, unknown> =
      typeof keyOrPatch === "string" ? { [keyOrPatch]: value } : keyOrPatch;
    const instancePatch: Record<string, unknown> = {};
    const settingsPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fullPatch)) {
      if (INSTANCE_KEYS.has(k)) instancePatch[k] = v;
      else settingsPatch[k] = v;
    }
    return { instancePatch, settingsPatch };
  }

  function cleanSettings(
    settings: Record<string, unknown>,
    settingsPatch: Record<string, unknown>,
    hasInstanceKeys: boolean
  ) {
    const cleaned = { ...settings, ...settingsPatch };
    if (hasInstanceKeys) {
      for (const key of INSTANCE_KEYS) delete cleaned[key];
    }
    return cleaned;
  }

  // Save handler — updates the specific item's settings within the section tree
  // Supports single key/value OR a batch patch object
  const handleChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (!config || !detailTarget || !resolved) return;

      const { instancePatch, settingsPatch } = splitPatch(keyOrPatch, value);
      const hasInstanceKeys = Object.keys(instancePatch).length > 0;

      const updatedSections = sections.map((section) => {
        if (section.id !== detailTarget.sectionId) return section;

        // Editing section — split patch between settings and presetSettings
        if (!detailTarget.blockId) {
          const presetKeys = resolved._presetSettingKeys;
          if (presetKeys && presetKeys.size > 0) {
            const sectionSettingsPatch: Record<string, unknown> = {};
            const presetSettingsPatch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(settingsPatch)) {
              if (presetKeys.has(k)) {
                presetSettingsPatch[k] = v;
              } else {
                sectionSettingsPatch[k] = v;
              }
            }
            return {
              ...section,
              ...instancePatch,
              settings: { ...section.settings, ...sectionSettingsPatch },
              presetSettings: { ...section.presetSettings, ...presetSettingsPatch },
            };
          }
          return {
            ...section,
            ...instancePatch,
            settings: cleanSettings(section.settings, settingsPatch, hasInstanceKeys),
          };
        }

        // Editing block or element — walk into blocks
        return {
          ...section,
          blocks: (section.blocks ?? []).map((block) => {
            if (block.id !== detailTarget.blockId) return block;

            // Editing block
            if (!detailTarget.elementId) {
              return {
                ...block,
                ...instancePatch,
                settings: cleanSettings(block.settings, settingsPatch, hasInstanceKeys),
              };
            }

            // Editing element — walk into slots
            return {
              ...block,
              slots: updateElementInSlots(
                block.slots,
                detailTarget.elementId,
                settingsPatch,
                instancePatch
              ),
            };
          }),
        };
      });

      pushUndo(getPageUndoSnapshot(config, currentPageId));
      saveDraft(buildSectionsPatch(config, currentPageId, updatedSections));
    },
    [config, detailTarget, resolved, sections, pushUndo, saveDraft]
  );

  // ── Element-level change handler for block panel ───────────
  // Reuses the exact same mutation path as element-level editing:
  // sections → block → updateElementInSlots → pushUndo → saveDraft

  const handleElementChange = useCallback(
    (elementId: string, keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (!config || !detailTarget?.blockId) return;

      const { instancePatch, settingsPatch } = splitPatch(keyOrPatch, value);

      const updatedSections = sections.map((section) => {
        if (section.id !== detailTarget.sectionId) return section;
        return {
          ...section,
          blocks: (section.blocks ?? []).map((block) => {
            if (block.id !== detailTarget.blockId) return block;
            return {
              ...block,
              slots: updateElementInSlots(block.slots, elementId, settingsPatch, instancePatch),
            };
          }),
        };
      });

      pushUndo(getPageUndoSnapshot(config, currentPageId));
      saveDraft(buildSectionsPatch(config, currentPageId, updatedSections));
    },
    [config, detailTarget, sections, pushUndo, saveDraft]
  );

  // ── Color scheme change handler (section-level, instance field) ──
  // Writes directly to section.colorSchemeId, not through settings.

  const handleColorSchemeChange = useCallback(
    (schemeId: string) => {
      if (!config || !detailTarget) return;

      const updatedSections = sections.map((section) => {
        if (section.id !== detailTarget.sectionId) return section;
        return { ...section, colorSchemeId: schemeId };
      });

      pushUndo(getPageUndoSnapshot(config, currentPageId));
      saveDraft(buildSectionsPatch(config, currentPageId, updatedSections));
    },
    [config, detailTarget, sections, pushUndo, saveDraft],
  );

  // Current section's colorSchemeId (for the dropdown)
  const currentColorSchemeId = useMemo(() => {
    if (!detailTarget) return undefined;
    const section = sections.find((s) => s.id === detailTarget.sectionId);
    return section?.colorSchemeId;
  }, [detailTarget, sections]);

  // ── Standalone element detection ─────────────────────────────
  // True when editing an element that lives directly in the page tree
  // (not inside a regular section). These get their own color scheme selector.
  const isStandaloneElement = useMemo(() => {
    if (!detailTarget?.elementId) return false;
    const section = sections.find((s) => s.id === detailTarget.sectionId);
    return section ? isStandaloneSection(section) : false;
  }, [detailTarget, sections]);

  // ── Block data for element forms ───────────────────────────
  // Only computed at block level — provides the block instance
  // and its slot definitions for rendering element forms.

  const blockData = useMemo(() => {
    if (!detailTarget?.blockId || !resolved || resolved.level !== "block") return null;
    const section = sections.find((s) => s.id === detailTarget.sectionId);
    if (!section) return null;
    const block = section.blocks.find((b) => b.id === detailTarget.blockId);
    if (!block) return null;

    const sectionDef = getSectionDefinition(section.definitionId);
    const preset = sectionDef?.presets.find((p) => p.key === section.presetKey);
    const blockTypeDef = preset?.blockTypes.find((bt) => bt.type === block.type);
    const slotDefs = blockTypeDef?.slots ?? [];

    return { block, slotDefs };
  }, [detailTarget, resolved, sections]);

  // Header scope → dedicated panel (after all hooks)
  if (detailTarget?.scope === "header") {
    return (
      <HeaderDetailPanel
        config={config}
        pushUndo={pushUndo}
        saveDraft={saveDraft}
        pageId={currentPageId}
        goBack={goBack}
      />
    );
  }

  if (detailTarget?.scope === "footer") {
    return (
      <FooterDetailPanel
        config={config}
        pushUndo={pushUndo}
        saveDraft={saveDraft}
        pageId={currentPageId}
        goBack={goBack}
      />
    );
  }

  if (detailTarget?.scope === "footer-classic-block") {
    return (
      <FooterClassicBlockPanel
        config={config}
        pushUndo={pushUndo}
        saveDraft={saveDraft}
        pageId={currentPageId}
        goBack={goBack}
        groupKey={detailTarget.blockId as "top" | "bottom"}
      />
    );
  }

  if (detailTarget?.scope === "footer-classic-element") {
    return (
      <FooterClassicElementPanel
        config={config}
        pushUndo={pushUndo}
        saveDraft={saveDraft}
        pageId={currentPageId}
        goBack={goBack}
        groupKey={detailTarget.blockId as "top" | "bottom"}
        elementId={detailTarget.elementId!}
      />
    );
  }

  if (!resolved) return null;

  const hasSettings = resolved.schema.length > 0;

  return (
    <div className="dp">
      {/* ── Header ── */}
      <div className="dp-header">
        <button
          type="button"
          className="dp-header__back"
          onClick={goBack}
          aria-label="Tillbaka"
        >
          <BackIcon />
        </button>
        <span className="dp-header__title">{resolved.name}</span>
        <button
          type="button"
          className="dp-header__menu"
          aria-label="Fler alternativ"
        >
          <MoreIcon />
        </button>
      </div>

      <div className="dp-divider" />

      {/* ── Body ── */}
      <div className="dp-body">
        {/* Schedule badge — disabled */}

        {hasSettings && (
          <SettingsForm
            schema={resolved.schema}
            values={resolved.values}
            onChange={handleChange}
          />
        )}

        {/* Universal section control: Color Scheme selector */}
        {resolved.level === "section" && config?.colorSchemes && config.colorSchemes.length > 0 && (!resolved._editableFields || resolved._editableFields.has("colorSchemeId")) && (
          <ColorSchemeSelect
            schemes={config.colorSchemes}
            value={currentColorSchemeId}
            onChange={handleColorSchemeChange}
          />
        )}

        {/* Block panel: element forms — renders each element's real settings */}
        {resolved.level === "block" && blockData && (
          <BlockElementsPanel
            block={blockData.block}
            slotDefs={blockData.slotDefs}
            onElementChange={handleElementChange}
          />
        )}

        {/* Standalone element: Color Scheme selector — only when element is not inside a section */}
        {resolved.level === "element" && isStandaloneElement && config?.colorSchemes && config.colorSchemes.length > 0 && (
          <ColorSchemeSelect
            schemes={config.colorSchemes}
            value={currentColorSchemeId}
            onChange={handleColorSchemeChange}
          />
        )}

        {/* Accordion: Avstånd — hidden when editableFields is set and doesn't include padding */}
        {(!resolved._editableFields || resolved._editableFields.has("paddingTop")) && (
          <SpacingAccordion
            paddingTop={(resolved.values.paddingTop as number) ?? 0}
            paddingRight={(resolved.values.paddingRight as number) ?? 0}
            paddingBottom={(resolved.values.paddingBottom as number) ?? 0}
            paddingLeft={(resolved.values.paddingLeft as number) ?? 0}
            onChange={handleChange}
          />
        )}

        {/* Schedule accordion — disabled */}

        {/* Content tree removed — direct navigation to element panels */}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE BADGE
// ═══════════════════════════════════════════════════════════════

const MONTHS_SV_SHORT = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

function formatSchedDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sthlm = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  return `${sthlm.getDate()} ${MONTHS_SV_SHORT[sthlm.getMonth()]} ${sthlm.getFullYear()}, ${String(sthlm.getHours()).padStart(2,"0")}:${String(sthlm.getMinutes()).padStart(2,"0")}`;
}

const CalendarBadgeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>
  </svg>
);

function ScheduleBadge({ scheduledShow, scheduledHide }: { scheduledShow?: string; scheduledHide?: string }) {
  const now = Date.now();
  const showTime = scheduledShow ? new Date(scheduledShow).getTime() : null;
  const hideTime = scheduledHide ? new Date(scheduledHide).getTime() : null;
  const isCurrentlyShowing = !showTime || showTime <= now;
  const expiresWithin2Days = hideTime && hideTime > now && (hideTime - now) <= 2 * 24 * 60 * 60 * 1000;

  if (isCurrentlyShowing && expiresWithin2Days && scheduledHide) {
    return (
      <div className="dp-schedule-badge dp-schedule-badge--expiring">
        <CalendarBadgeIcon />
        <span>Slutar att visas {formatSchedDate(scheduledHide)}</span>
      </div>
    );
  }

  if (scheduledShow && showTime && showTime > now) {
    return (
      <div className="dp-schedule-badge">
        <CalendarBadgeIcon />
        <span>Schemalagd {formatSchedDate(scheduledShow)}</span>
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// SPACING ACCORDION
// ═══════════════════════════════════════════════════════════════

function SpacingAccordion({
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  onChange,
}: {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  onChange: (keyOrPatch: string | Record<string, unknown>, value?: unknown) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="dp-accordion">
      <button
        type="button"
        className="dp-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-accordion__label">Avstånd</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron ${open ? "dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-accordion__content">
          <div className="dp-accordion__section-label">Padding</div>
          <FieldSpacing
            paddingTop={paddingTop}
            paddingRight={paddingRight}
            paddingBottom={paddingBottom}
            paddingLeft={paddingLeft}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE ACCORDION
// ═══════════════════════════════════════════════════════════════

function ScheduleAccordion({
  scheduledShow,
  scheduledHide,
  onChange,
}: {
  scheduledShow?: string;
  scheduledHide?: string;
  onChange: (keyOrPatch: string | Record<string, unknown>, value?: unknown) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="dp-accordion dp-accordion--bottom-only">
      <button
        type="button"
        className="dp-accordion__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-accordion__label">Schemalägg</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron ${open ? "dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-accordion__content">
          <FieldSchedule
            scheduledShow={scheduledShow}
            scheduledHide={scheduledHide}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BLOCK ELEMENTS PANEL
// ═══════════════════════════════════════════════════════════════

/**
 * Renders each element's REAL settings form inside the block panel.
 *
 * This is NOT a separate config model — it renders the same SettingsForm
 * with the same schema (from ElementDefinition.settingsSchema) and the
 * same values (from ElementInstance.settings) that the element panel uses.
 *
 * Changes go through the same mutation path (updateElementInSlots),
 * so block panel and element panel always show the same data.
 *
 * New element types and new fields automatically appear because this
 * component reads from the registry at render time — no hardcoded
 * field lists or element-specific logic.
 */
function BlockElementsPanel({
  block,
  slotDefs,
  onElementChange,
}: {
  block: BlockInstance;
  slotDefs: SlotDefinition[];
  onElementChange: (
    elementId: string,
    keyOrPatch: string | Record<string, unknown>,
    value?: unknown
  ) => void;
}) {
  // Collect elements in slot order (same order as in the block)
  const orderedElements = useMemo(() => {
    const result: ElementInstance[] = [];
    const coveredKeys = new Set<string>();

    for (const slotDef of slotDefs) {
      coveredKeys.add(slotDef.key);
      const elements = block.slots[slotDef.key] ?? [];
      for (const el of [...elements].sort((a, b) => a.sortOrder - b.sortOrder)) {
        result.push(el);
      }
    }

    // Defensive: include elements from slots not in slotDefs
    for (const [key, elements] of Object.entries(block.slots)) {
      if (coveredKeys.has(key)) continue;
      for (const el of [...elements].sort((a, b) => a.sortOrder - b.sortOrder)) {
        result.push(el);
      }
    }

    return result;
  }, [block.slots, slotDefs]);

  if (orderedElements.length === 0) return null;

  return (
    <div className="dp-elements">
      {orderedElements.map((element) => (
        <ElementFormGroup
          key={element.id}
          element={element}
          onElementChange={onElementChange}
        />
      ))}
    </div>
  );
}

/**
 * A single element's settings rendered as a collapsible group.
 * Uses the element's real definition schema and real instance settings.
 */
function ElementFormGroup({
  element,
  onElementChange,
}: {
  element: ElementInstance;
  onElementChange: (
    elementId: string,
    keyOrPatch: string | Record<string, unknown>,
    value?: unknown
  ) => void;
}) {
  const [open, setOpen] = useState(true);

  const def = getElementDefinition(element.type);
  if (!def) return null;

  const visibleFields = def.settingsSchema.filter((f) => !f.hidden);
  if (visibleFields.length === 0) return null;

  const name = def.name;

  // Bind onChange to this specific element — same mutation path as element panel
  const handleChange: FieldOnChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      onElementChange(element.id, keyOrPatch, value);
    },
    [element.id, onElementChange]
  );

  return (
    <div className="dp-el-group">
      <button
        type="button"
        className="dp-el-group__header"
        onClick={() => setOpen(!open)}
      >
        <span className="dp-el-group__icon">
          <EditorIcon name={def.icon} size={18} />
        </span>
        <span className="dp-el-group__name">{name}</span>
        <EditorIcon
          name="expand_more"
          size={18}
          className={`dp-accordion__chevron${open ? " dp-accordion__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="dp-el-group__body">
          <SettingsForm
            schema={def.settingsSchema}
            values={element.settings}
            onChange={handleChange}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTENT TREE — SECTION LEVEL
// ═══════════════════════════════════════════════════════════════

/**
 * Shows all blocks within the section, each with their slots and elements.
 * Clicking a block navigates to block level; clicking an element navigates
 * to element level.
 */
function SectionContentTree({
  target,
  sections,
  hasSettingsAbove,
  onNavigate,
}: {
  target: DetailTarget;
  sections: SectionInstance[];
  hasSettingsAbove: boolean;
  onNavigate: (target: DetailTarget) => void;
}) {
  const section = sections.find((s) => s.id === target.sectionId);
  if (!section) return null;

  const sectionDef = getSectionDefinition(section.definitionId);
  const preset = sectionDef?.presets.find(
    (p) => p.key === section.presetKey
  );
  const blockTypeDefs = preset?.blockTypes ?? [];

  if (section.blocks.length === 0) {
    return (
      <div className={`ct ${hasSettingsAbove ? "ct--with-divider" : ""}`}>
        <div className="ct-section-label">Innehåll</div>
        <div className="ct-empty">Inga block i den här sektionen.</div>
      </div>
    );
  }

  return (
    <div className={`ct ${hasSettingsAbove ? "ct--with-divider" : ""}`}>
      <div className="ct-section-label">Innehåll</div>

      {section.blocks
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((block) => {
          const blockTypeDef = blockTypeDefs.find(
            (bt) => bt.type === block.type
          );
          return (
            <BlockCard
              key={block.id}
              block={block}
              blockTypeDef={blockTypeDef}
              sectionId={section.id}
              onNavigate={onNavigate}
            />
          );
        })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTENT TREE — BLOCK LEVEL
// ═══════════════════════════════════════════════════════════════

/**
 * Shows all elements within the block, grouped by slot.
 * Clicking an element navigates to element level.
 */
function BlockContentTree({
  target,
  sections,
  hasSettingsAbove,
  onNavigate,
}: {
  target: DetailTarget;
  sections: SectionInstance[];
  hasSettingsAbove: boolean;
  onNavigate: (target: DetailTarget) => void;
}) {
  const section = sections.find((s) => s.id === target.sectionId);
  if (!section) return null;

  const block = section.blocks.find((b) => b.id === target.blockId);
  if (!block) return null;

  const sectionDef = getSectionDefinition(section.definitionId);
  const preset = sectionDef?.presets.find(
    (p) => p.key === section.presetKey
  );
  const blockTypeDef = preset?.blockTypes.find(
    (bt) => bt.type === block.type
  );
  const slotDefs = blockTypeDef?.slots ?? [];

  // Collect all elements across slots
  const allElements = Object.values(block.slots).flat();
  if (allElements.length === 0) {
    return (
      <div className={`ct ${hasSettingsAbove ? "ct--with-divider" : ""}`}>
        <div className="ct-section-label">Element</div>
        <div className="ct-empty">Inga element i det här blocket.</div>
      </div>
    );
  }

  return (
    <div className={`ct ${hasSettingsAbove ? "ct--with-divider" : ""}`}>
      <div className="ct-section-label">Element</div>

      {slotDefs.map((slotDef) => {
        const elements = block.slots[slotDef.key] ?? [];
        if (elements.length === 0) return null;

        return (
          <div key={slotDef.key} className="ct-slot">
            <div className="ct-slot__label">{slotDef.name}</div>
            {elements
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((element) => (
                <ElementRow
                  key={element.id}
                  element={element}
                  onClick={() =>
                    onNavigate({
                      sectionId: section.id,
                      blockId: block.id,
                      elementId: element.id,
                    })
                  }
                />
              ))}
          </div>
        );
      })}

      {/* Render elements from slots not covered by slotDefs (defensive) */}
      {Object.entries(block.slots)
        .filter(([key]) => !slotDefs.some((sd) => sd.key === key))
        .map(([key, elements]) =>
          elements.length > 0 ? (
            <div key={key} className="ct-slot">
              <div className="ct-slot__label">{key}</div>
              {elements
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((element) => (
                  <ElementRow
                    key={element.id}
                    element={element}
                    onClick={() =>
                      onNavigate({
                        sectionId: section.id,
                        blockId: block.id,
                        elementId: element.id,
                      })
                    }
                  />
                ))}
            </div>
          ) : null
        )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

/**
 * A block card within the section content tree.
 * Shows the block name, its slots, and clickable element rows.
 */
function BlockCard({
  block,
  blockTypeDef,
  sectionId,
  onNavigate,
}: {
  block: BlockInstance;
  blockTypeDef?: BlockTypeDefinition;
  sectionId: string;
  onNavigate: (target: DetailTarget) => void;
}) {
  const slotDefs = blockTypeDef?.slots ?? [];
  const blockName = blockTypeDef?.name || block.type;

  return (
    <div className="ct-block">
      {/* Block header — clickable to navigate to block level */}
      <button
        type="button"
        className="ct-block__header"
        onClick={() =>
          onNavigate({ sectionId, blockId: block.id })
        }
      >
        <BlockIcon />
        <span className="ct-block__name">{blockName}</span>
        <ChevronIcon />
      </button>

      {/* Slots and their elements */}
      {slotDefs.map((slotDef) => {
        const elements = block.slots[slotDef.key] ?? [];
        if (elements.length === 0) return null;

        return (
          <div key={slotDef.key} className="ct-slot">
            <div className="ct-slot__label">{slotDef.name}</div>
            {elements
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((element) => (
                <ElementRow
                  key={element.id}
                  element={element}
                  onClick={() =>
                    onNavigate({
                      sectionId,
                      blockId: block.id,
                      elementId: element.id,
                    })
                  }
                />
              ))}
          </div>
        );
      })}

      {/* Defensive: render slots not in slotDefs */}
      {Object.entries(block.slots)
        .filter(([key]) => !slotDefs.some((sd) => sd.key === key))
        .map(([key, elements]) =>
          elements.length > 0 ? (
            <div key={key} className="ct-slot">
              <div className="ct-slot__label">{key}</div>
              {elements
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((element) => (
                  <ElementRow
                    key={element.id}
                    element={element}
                    onClick={() =>
                      onNavigate({
                        sectionId,
                        blockId: block.id,
                        elementId: element.id,
                      })
                    }
                  />
                ))}
            </div>
          ) : null
        )}
    </div>
  );
}

/**
 * A single element row — shows icon, name, preview text, and chevron.
 * The preview text is derived from the element's `content` or `label`
 * setting (whichever exists), giving instant context without opening.
 */
function ElementRow({
  element,
  onClick,
}: {
  element: ElementInstance;
  onClick: () => void;
}) {
  const def = getElementDefinition(element.type);
  const name = def?.name || element.type;

  // Derive a preview string from common content keys
  const preview = extractPreview(element.settings);

  return (
    <button type="button" className="ct-element" onClick={onClick}>
      <span className="ct-element__icon">
        <ElementTypeIcon elementType={element.type} />
      </span>
      <span className="ct-element__text">
        <span className="ct-element__name">{name}</span>
        {preview && (
          <span className="ct-element__preview">{preview}</span>
        )}
      </span>
      <ChevronIcon />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// HEADER DETAIL PANEL
// ═══════════════════════════════════════════════════════════════

function HeaderDetailPanel({
  config,
  pushUndo,
  saveDraft,
  goBack,
  pageId,
}: {
  config: any;
  pushUndo: (snapshot: Record<string, unknown>) => void;
  saveDraft: (changes: any) => any;
  goBack: () => void;
  pageId: import("@/app/_lib/pages/types").PageId;
}) {
  const header: HeaderConfig = { ...HEADER_DEFAULTS, ...getPageHeader(config, pageId) };
  const schemes = config?.colorSchemes ?? [];

  const save = useCallback(
    (patch: Partial<HeaderConfig>) => {
      pushUndo(getPageUndoSnapshot(config, pageId));
      saveDraft(buildHeaderPatch(config, pageId, { ...header, ...patch }));
    },
    [pushUndo, saveDraft, header, config, pageId],
  );

  const handleSpacingChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      const PADDING_KEY_MAP: Record<string, keyof HeaderConfig> = {
        paddingTop: "paddingTop",
        paddingRight: "paddingRight",
        paddingBottom: "paddingBottom",
        paddingLeft: "paddingLeft",
      };
      if (typeof keyOrPatch === "string") {
        const mapped = PADDING_KEY_MAP[keyOrPatch] || keyOrPatch;
        save({ [mapped]: value } as Partial<HeaderConfig>);
      } else {
        const patch: Partial<HeaderConfig> = {};
        for (const [k, v] of Object.entries(keyOrPatch)) {
          const mapped = PADDING_KEY_MAP[k] || k;
          (patch as any)[mapped] = v;
        }
        save(patch);
      }
    },
    [save],
  );

  return (
    <div className="dp">
      <div className="dp-header">
        <button type="button" className="dp-header__back" onClick={goBack} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <span className="dp-header__title">Sidhuvud</span>
      </div>

      <div className="dp-divider" />

      <div className="dp-body">
        {/* Logo */}
        <span className="sf-group-label">Logotyp</span>
        <div>
          <span className="sf-label" style={{ display: "block", marginBottom: 6 }}>Position</span>
          <SegmentedControl
            options={[
              { value: "left", label: "Vänster" },
              { value: "center", label: "Centrerad" },
            ]}
            value={header.logoPosition}
            onChange={(v) => save({ logoPosition: v as "left" | "center" })}
          />
        </div>

        <div className="sf-group-divider" />

        {/* Menu */}
        <span className="sf-group-label">Meny</span>
        <div>
          <span className="sf-label" style={{ display: "block", marginBottom: 6 }}>Position (mobil)</span>
          <SegmentedControl
            options={[
              { value: "left", label: "Vänster" },
              { value: "right", label: "Höger" },
            ]}
            value={header.menuPosition ?? "right"}
            onChange={(v) => save({ menuPosition: v as "left" | "right" })}
          />
        </div>
        <FieldMenuPicker
          field={{ key: "headerMenuId", type: "menuPicker", label: "Meny" }}
          value={header.headerMenuId ?? ""}
          onChange={(_key, value) => save({ headerMenuId: (value as string) || "" })}
        />
        <FieldSelect
          field={{
            key: "menuFont",
            type: "select",
            label: "Teckensnitt",
            default: "body",
            options: [
              { value: "body", label: "Brödtext" },
              { value: "heading", label: "Rubrik" },
              { value: "accent", label: "Accent" },
            ],
          }}
          value={header.menuFont ?? "body"}
          onChange={(_key, value) => save({ menuFont: value as "body" | "heading" | "accent" })}
        />

        <div className="sf-group-divider" />

        {/* Localization */}
        <span className="sf-group-label">Lokalisering</span>
        <div>
          <div className="sf-toggle-row">
            <div>
              <span>Språkväljare</span>
              <a
                href="/home#settings/languages"
                target="_blank"
                rel="noopener noreferrer"
                className="sf-toggle-desc-link"
              >
                Hantera språk
              </a>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={header.showLanguageSwitcher ?? false}
              className={`sf-toggle${header.showLanguageSwitcher ? " sf-toggle--on" : ""}`}
              onClick={() => save({ showLanguageSwitcher: !header.showLanguageSwitcher })}
            >
              <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
              <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
              <span className="sf-toggle__thumb" />
            </button>
          </div>
        </div>
        <div className="sf-toggle-row">
          <span>Visa flaggor</span>
          <button
            type="button"
            role="switch"
            aria-checked={header.showFlags ?? false}
            className={`sf-toggle${header.showFlags ? " sf-toggle--on" : ""}`}
            onClick={() => save({ showFlags: !header.showFlags })}
          >
            <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
            <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
            <span className="sf-toggle__thumb" />
          </button>
        </div>
        <div>
          <span className="sf-label" style={{ display: "block", marginBottom: 6 }}>Position</span>
          <SegmentedControl
            options={[
              { value: "left", label: "Vänster" },
              { value: "right", label: "Höger" },
            ]}
            value={header.languageSwitcherPosition ?? "right"}
            onChange={(v) => save({ languageSwitcherPosition: v as "left" | "right" })}
          />
        </div>

        <div className="sf-group-divider" />

        {/* Appearance */}
        <span className="sf-group-label">Utseende</span>
        <div>
          <div className="sf-toggle-row">
            <span>Avskiljande linje</span>
            <button
              type="button"
              role="switch"
              aria-checked={header.showDivider}
              className={`sf-toggle${header.showDivider ? " sf-toggle--on" : ""}`}
              onClick={() => save({ showDivider: !header.showDivider })}
            >
              <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
              <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
              <span className="sf-toggle__thumb" />
            </button>
          </div>
        </div>

        {/* Color scheme */}
        {schemes.length > 0 && (
          <ColorSchemeSelect
            schemes={schemes}
            value={header.colorSchemeId}
            onChange={(schemeId) => save({ colorSchemeId: schemeId })}
          />
        )}

        {/* Spacing */}
        <SpacingAccordion
          paddingTop={header.paddingTop}
          paddingRight={header.paddingRight}
          paddingBottom={header.paddingBottom}
          paddingLeft={header.paddingLeft}
          onChange={handleSpacingChange}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FOOTER DETAIL PANEL
// ═══════════════════════════════════════════════════════════════


const FOOTER_LAYOUT_OPTIONS: { value: string; label: string; description: string; image: string }[] = [
  {
    value: "app",
    label: "App",
    description: "Fast fält med ikoner och etiketter.",
    image: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773863720/Namnl%C3%B6st-2_qcs1hl.png",
  },
  {
    value: "classic",
    label: "Klassisk",
    description: "Sidfot med menyer, logotyp och länkar.",
    image: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773863716/footer_ydduaz.png",
  },
];

function FooterLayoutPicker({ value, onChange }: { value: string; onChange: (v: "app" | "classic") => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupTop, setPopupTop] = useState(0);
  const selected = FOOTER_LAYOUT_OPTIONS.find((o) => o.value === value) ?? FOOTER_LAYOUT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <div>
      <span className="sf-label" style={{ display: "block", marginBottom: 6 }}>Layout</span>
      <button
        ref={triggerRef}
        type="button"
        className="sf-layout-picker__trigger"
        onClick={() => setOpen(!open)}
      >
        <img src={selected.image} alt={selected.label} className="sf-layout-picker__thumb" />
        <span className="sf-dropdown__text">{selected.label}</span>
        <EditorIcon name="expand_more" size={16} className="sf-dropdown__chevron" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="layout-picker-popup"
          ref={popupRef}
          style={{ top: popupTop }}
        >
          <div className="layout-picker-popup__list">
            {FOOTER_LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`layout-picker-popup__item${opt.value === value ? " layout-picker-popup__item--active" : ""}`}
                onClick={() => { onChange(opt.value as "app" | "classic"); setOpen(false); }}
              >
                <img src={opt.image} alt={opt.label} className="layout-picker-popup__thumb" />
                <span className="layout-picker-popup__text">
                  <span className="layout-picker-popup__label">{opt.label}</span>
                  <span className="layout-picker-popup__desc">{opt.description}</span>
                </span>
                <span className={`material-symbols-rounded sf-dropdown__check${opt.value === value ? " sf-dropdown__check--visible" : ""}`}>check</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Footer Classic Block Panel ──────────────────────────────

function FooterClassicBlockPanel({
  config,
  pushUndo,
  saveDraft,
  goBack,
  pageId,
  groupKey,
}: {
  config: any;
  pushUndo: (snapshot: Record<string, unknown>) => void;
  saveDraft: (changes: any) => any;
  goBack: () => void;
  pageId: import("@/app/_lib/pages/types").PageId;
  groupKey: "top" | "bottom";
}) {
  const footer: PageFooterConfig = { ...PAGE_FOOTER_DEFAULTS, ...getPageFooter(config, pageId) };
  const groups = footer.classicGroups;
  const elements = [...(groups?.[groupKey] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleElementChange = useCallback(
    (elementId: string, keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (!groups) return;
      const patch = typeof keyOrPatch === "string" ? { [keyOrPatch]: value } : keyOrPatch;
      const updatedElements = groups[groupKey].map((el) =>
        el.id === elementId ? { ...el, settings: { ...el.settings, ...patch } } : el,
      );
      pushUndo(getPageUndoSnapshot(config, pageId));
      saveDraft(buildFooterPatch(config, pageId, {
        ...footer,
        classicGroups: { ...groups, [groupKey]: updatedElements },
      }));
    },
    [groups, groupKey, pushUndo, saveDraft, config, pageId, footer],
  );

  return (
    <div className="dp">
      <div className="dp-header">
        <button type="button" className="dp-header__back" onClick={goBack} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <span className="dp-header__title">Grupp</span>
      </div>

      <div className="dp-divider" />

      <div className="dp-body">
        {elements.length > 0 && (
          <div className="dp-elements">
            {elements.map((element) => (
              <ElementFormGroup
                key={element.id}
                element={element}
                onElementChange={handleElementChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer Classic Element Panel ────────────────────────────

function FooterClassicElementPanel({
  config,
  pushUndo,
  saveDraft,
  goBack,
  pageId,
  groupKey,
  elementId,
}: {
  config: any;
  pushUndo: (snapshot: Record<string, unknown>) => void;
  saveDraft: (changes: any) => any;
  goBack: () => void;
  pageId: import("@/app/_lib/pages/types").PageId;
  groupKey: "top" | "bottom";
  elementId: string;
}) {
  const footer: PageFooterConfig = { ...PAGE_FOOTER_DEFAULTS, ...getPageFooter(config, pageId) };
  const groups = footer.classicGroups;
  const elements = groups?.[groupKey] ?? [];
  const element = elements.find((el) => el.id === elementId);

  const def = element ? getElementDefinition(element.type) : null;
  const schema = def?.settingsSchema ?? [];
  const values = { ...(def?.settingDefaults ?? {}), ...(element?.settings ?? {}) };
  const name = def?.name ?? element?.type ?? "Element";

  const handleChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (!groups || !element) return;
      const patch = typeof keyOrPatch === "string" ? { [keyOrPatch]: value } : keyOrPatch;
      const updatedElements = elements.map((el) =>
        el.id === elementId ? { ...el, settings: { ...el.settings, ...patch } } : el,
      );
      pushUndo(getPageUndoSnapshot(config, pageId));
      saveDraft(buildFooterPatch(config, pageId, {
        ...footer,
        classicGroups: { ...groups, [groupKey]: updatedElements },
      }));
    },
    [groups, element, elements, elementId, pushUndo, saveDraft, config, pageId, footer, groupKey],
  );

  if (!element || !def) {
    return (
      <div className="dp">
        <div className="dp-header">
          <button type="button" className="dp-header__back" onClick={goBack} aria-label="Tillbaka">
            <BackIcon />
          </button>
          <span className="dp-header__title">Element hittades inte</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dp">
      <div className="dp-header">
        <button type="button" className="dp-header__back" onClick={goBack} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <span className="dp-header__title">{name}</span>
      </div>

      <div className="dp-divider" />

      <div className="dp-body">
        {schema.length > 0 && (
          <SettingsForm
            schema={schema}
            values={values}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  );
}

function FooterDetailPanel({
  config,
  pushUndo,
  saveDraft,
  goBack,
  pageId,
}: {
  config: any;
  pushUndo: (snapshot: Record<string, unknown>) => void;
  saveDraft: (changes: any) => any;
  goBack: () => void;
  pageId: import("@/app/_lib/pages/types").PageId;
}) {
  const footer: PageFooterConfig = { ...PAGE_FOOTER_DEFAULTS, ...getPageFooter(config, pageId) };
  const schemes = config?.colorSchemes ?? [];

  const save = useCallback(
    (patch: Partial<PageFooterConfig>) => {
      pushUndo(getPageUndoSnapshot(config, pageId));
      saveDraft(buildFooterPatch(config, pageId, { ...footer, ...patch }));
    },
    [pushUndo, saveDraft, footer, config, pageId],
  );

  const handleFooterSpacing = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (typeof keyOrPatch === "string") {
        save({ [keyOrPatch]: value } as Partial<PageFooterConfig>);
      } else {
        save(keyOrPatch as Partial<PageFooterConfig>);
      }
    },
    [save],
  );

  return (
    <div className="dp">
      <div className="dp-header">
        <button type="button" className="dp-header__back" onClick={goBack} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <span className="dp-header__title">Sidfot</span>
      </div>

      <div className="dp-divider" />

      <div className="dp-body">
        {/* Layout picker */}
        <FooterLayoutPicker value={footer.footerLayout ?? "app"} onChange={(v) => save({ footerLayout: v })} />

        <div className="sf-group-divider" />

        {/* Show divider toggle */}
        <div>
          <div className="sf-toggle-row">
            <span>Avskiljande linje</span>
            <button
              type="button"
              role="switch"
              aria-checked={footer.showDivider}
              className={`sf-toggle${footer.showDivider ? " sf-toggle--on" : ""}`}
              onClick={() => save({ showDivider: !footer.showDivider })}
            >
              <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
              <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
              <span className="sf-toggle__thumb" />
            </button>
          </div>
        </div>

        <div className="sf-group-divider" />

        {/* Color scheme */}
        {schemes.length > 0 && (
          <ColorSchemeSelect
            schemes={schemes}
            value={footer.colorSchemeId}
            onChange={(schemeId) => save({ colorSchemeId: schemeId })}
          />
        )}

        {/* Spacing */}
        <SpacingAccordion
          paddingTop={footer.paddingTop}
          paddingRight={footer.paddingRight}
          paddingBottom={footer.paddingBottom}
          paddingLeft={footer.paddingLeft}
          onChange={handleFooterSpacing}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RESOLUTION
// ═══════════════════════════════════════════════════════════════

type ResolvedTarget = {
  level: "section" | "block" | "element";
  name: string;
  schema: SettingField[];
  values: Record<string, unknown>;
  /** Keys that belong to presetSettings (section level only). */
  _presetSettingKeys?: Set<string>;
  /** Element type key (element level only). */
  _elementType?: string;
  /**
   * Platform-admin contract: when set, only these field keys are editable.
   * Used by locked sections to restrict which controls DetailPanel shows.
   * Undefined means "show all fields" (default for free sections).
   */
  _editableFields?: Set<string>;
};

function resolveTarget(
  target: DetailTarget,
  sections: SectionInstance[]
): ResolvedTarget | null {
  const section = sections.find((s) => s.id === target.sectionId);
  if (!section) return null;

  // Section level — merge section settings + preset settings into one form
  if (!target.blockId) {
    const def = getSectionDefinition(section.definitionId);
    const preset = def?.presets.find((p) => p.key === section.presetKey);
    const sectionSchema = def?.settingsSchema ?? [];
    const presetSchema = preset?.settingsSchema ?? [];
    const fullSchema = [...sectionSchema, ...presetSchema];

    // editableFields guard: filter schema to only platform-allowed fields
    const editable = def?.editableFields;
    const editableSet = editable ? new Set(editable) : undefined;
    const filteredSchema = editableSet
      ? fullSchema.filter((f) => editableSet.has(f.key))
      : fullSchema;

    return {
      level: "section",
      name: section.title || def?.name || section.definitionId,
      schema: filteredSchema,
      values: {
        ...section.presetSettings,
        ...section.settings,
        scheduledShow: section.scheduledShow ?? (section.settings?.scheduledShow as string | undefined),
        scheduledHide: section.scheduledHide ?? (section.settings?.scheduledHide as string | undefined),
      },
      _presetSettingKeys: new Set(presetSchema.map((f) => f.key)),
      _editableFields: editableSet,
    } as ResolvedTarget;
  }

  // Block level
  const block = section.blocks.find((b) => b.id === target.blockId);
  if (!block) return null;

  if (!target.elementId) {
    const sectionDef = getSectionDefinition(section.definitionId);
    const preset = sectionDef?.presets.find(
      (p) => p.key === section.presetKey
    );
    const blockTypeDef = preset?.blockTypes.find(
      (bt) => bt.type === block.type
    );
    return {
      level: "block",
      name: blockTypeDef?.name || block.type,
      schema: blockTypeDef?.settingsSchema ?? [],
      values: {
        ...block.settings,
        scheduledShow: block.scheduledShow ?? (block.settings?.scheduledShow as string | undefined),
        scheduledHide: block.scheduledHide ?? (block.settings?.scheduledHide as string | undefined),
      },
    };
  }

  // Element level
  const element = findElementInSlots(block.slots, target.elementId);
  if (!element) return null;

  const elementDef = getElementDefinition(element.type);
  return {
    level: "element",
    name: elementDef?.name || element.type,
    schema: elementDef?.settingsSchema ?? [],
    values: {
      ...element.settings,
      scheduledShow: element.scheduledShow ?? (element.settings?.scheduledShow as string | undefined),
      scheduledHide: element.scheduledHide ?? (element.settings?.scheduledHide as string | undefined),
    },
    _elementType: element.type,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function findElementInSlots(
  slots: Record<string, ElementInstance[]>,
  elementId: string
): ElementInstance | null {
  for (const elements of Object.values(slots)) {
    const found = elements.find((el) => el.id === elementId);
    if (found) return found;
  }
  return null;
}

function updateElementInSlots(
  slots: Record<string, ElementInstance[]>,
  elementId: string,
  settingsPatch: Record<string, unknown>,
  instancePatch: Record<string, unknown> = {}
): Record<string, ElementInstance[]> {
  const INSTANCE_KEYS = new Set(["scheduledShow", "scheduledHide"]);
  const hasInstanceKeys = Object.keys(instancePatch).length > 0;
  const updated: Record<string, ElementInstance[]> = {};
  for (const [slotKey, elements] of Object.entries(slots)) {
    updated[slotKey] = elements.map((el) => {
      if (el.id !== elementId) return el;
      const newSettings = { ...el.settings, ...settingsPatch };
      // Remove schedule keys from settings (legacy cleanup)
      if (hasInstanceKeys) {
        for (const key of INSTANCE_KEYS) delete newSettings[key];
      }
      return { ...el, ...instancePatch, settings: newSettings };
    });
  }
  return updated;
}

/**
 * Extract a human-readable preview from element settings.
 * Checks common content keys in priority order.
 */
function extractPreview(settings: Record<string, unknown>): string | null {
  const keys = ["content", "label", "text", "title", "src", "url"];
  for (const key of keys) {
    const val = settings[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.length > 40 ? val.slice(0, 40) + "\u2026" : val;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function BackIcon() {
  return <EditorIcon name="chevron_left" size={20} />;
}

function MoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 8a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
      <path d="M9.5 8a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
      <path d="M13.5 9.5a1.5 1.5 0 1 0-.001-3.001 1.5 1.5 0 0 0 .001 3.001" />
    </svg>
  );
}

function ChevronIcon() {
  return <EditorIcon name="chevron_right" size={16} className="ct-chevron" />;
}

function BlockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="10"
        y="2"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="2"
        y="10"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="10"
        y="10"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ElementTypeIcon({ elementType }: { elementType: string }) {
  switch (elementType) {
    case "heading":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 4v10M14 4v10M4 9h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "text":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 5h12M3 9h10M3 13h8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "button":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="2"
            y="5"
            width="14"
            height="8"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M6 9h6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "image":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="2"
            y="3"
            width="14"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <circle cx="6.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1" />
          <path
            d="M2 13l4-3 3 2 3-2 4 3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "divider":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 9h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="2 2"
          />
        </svg>
      );
    case "icon":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M9 2l2.5 5 5.5.8-4 3.9.9 5.3L9 14.5 4.1 17l.9-5.3-4-3.9L6.5 7z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "richtext":
      return (
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M4 4v4M10 4v4M4 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M3 11h12M3 14h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      );
    case "map":
      return <EditorIcon name="map" size={14} />;
    default:
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="2"
            y="2"
            width="14"
            height="14"
            rx="3.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      );
  }
}
