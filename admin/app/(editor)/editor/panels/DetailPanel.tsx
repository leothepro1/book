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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor, type DetailTarget } from "../EditorContext";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { usePublishBar } from "@/app/(admin)/_components/PublishBar";
import { useDraftUpdate } from "@/app/(admin)/_hooks/useDraftUpdate";
import { SettingsForm } from "../fields";
import { FieldSpacing } from "../fields/FieldSpacing";
import { FieldSchedule } from "../fields/FieldSchedule";
import {
  getElementDefinition,
  getSectionDefinition,
  ensureSectionsRegistered,
} from "@/app/_lib/sections/registry";
import { EditorIcon } from "@/app/_components/EditorIcon";
import type {
  SectionInstance,
  BlockInstance,
  ElementInstance,
  SettingField,
  BlockTypeDefinition,
  SlotDefinition,
} from "@/app/_lib/sections/types";

// ─── Main Component ─────────────────────────────────────────

export function DetailPanel() {
  const { detailTarget, goBack, openDetail } = useEditor();
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();
  const [registryReady, setRegistryReady] = useState(false);

  useEffect(() => {
    ensureSectionsRegistered().then(() => setRegistryReady(true));
  }, []);

  const sections: SectionInstance[] = config?.home?.sections ?? [];

  // Resolve what we're editing
  const resolved = useMemo(() => {
    if (!detailTarget || !registryReady) return null;
    return resolveTarget(detailTarget, sections);
  }, [detailTarget, sections, registryReady]);

  // Save handler — updates the specific item's settings within the section tree
  // Supports single key/value OR a batch patch object
  const handleChange = useCallback(
    (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (!config || !detailTarget || !resolved) return;

      const fullPatch: Record<string, unknown> =
        typeof keyOrPatch === "string" ? { [keyOrPatch]: value } : keyOrPatch;

      // Separate schedule fields (live on instance) from settings fields
      const INSTANCE_KEYS = new Set(["scheduledShow", "scheduledHide"]);
      const instancePatch: Record<string, unknown> = {};
      const settingsPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fullPatch)) {
        if (INSTANCE_KEYS.has(k)) {
          instancePatch[k] = v;
        } else {
          settingsPatch[k] = v;
        }
      }

      // Remove schedule keys from settings if they exist there (legacy cleanup)
      const hasInstanceKeys = Object.keys(instancePatch).length > 0;
      const cleanSettings = (settings: Record<string, unknown>) => {
        if (!hasInstanceKeys) return { ...settings, ...settingsPatch };
        const cleaned = { ...settings, ...settingsPatch };
        for (const key of INSTANCE_KEYS) delete cleaned[key];
        return cleaned;
      };

      const updatedSections = sections.map((section) => {
        if (section.id !== detailTarget.sectionId) return section;

        // Editing section
        if (!detailTarget.blockId) {
          return {
            ...section,
            ...instancePatch,
            settings: cleanSettings(section.settings),
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
                settings: cleanSettings(block.settings),
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

      pushUndo({ home: config.home });
      saveDraft({ home: { ...config.home, sections: updatedSections } });
    },
    [config, detailTarget, resolved, sections, pushUndo, saveDraft]
  );

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
        {/* Schedule badge — shown when item is scheduled */}
        <ScheduleBadge
          scheduledShow={(resolved.values.scheduledShow as string) ?? undefined}
          scheduledHide={(resolved.values.scheduledHide as string) ?? undefined}
        />

        {hasSettings && (
          <SettingsForm
            schema={resolved.schema}
            values={resolved.values}
            onChange={handleChange}
          />
        )}

        {/* Accordion: Avstånd — inside body, right after form */}
        <SpacingAccordion
          paddingTop={(resolved.values.paddingTop as number) ?? 0}
          paddingRight={(resolved.values.paddingRight as number) ?? 0}
          paddingBottom={(resolved.values.paddingBottom as number) ?? 0}
          paddingLeft={(resolved.values.paddingLeft as number) ?? 0}
          onChange={handleChange}
        />

        {/* Accordion: Schemalägg */}
        <ScheduleAccordion
          scheduledShow={(resolved.values.scheduledShow as string) ?? undefined}
          scheduledHide={(resolved.values.scheduledHide as string) ?? undefined}
          onChange={handleChange}
        />

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
          size={16}
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
          size={16}
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
// RESOLUTION
// ═══════════════════════════════════════════════════════════════

type ResolvedTarget = {
  level: "section" | "block" | "element";
  name: string;
  schema: SettingField[];
  values: Record<string, unknown>;
};

function resolveTarget(
  target: DetailTarget,
  sections: SectionInstance[]
): ResolvedTarget | null {
  const section = sections.find((s) => s.id === target.sectionId);
  if (!section) return null;

  // Section level
  if (!target.blockId) {
    const def = getSectionDefinition(section.definitionId);
    return {
      level: "section",
      name: section.title || def?.name || section.definitionId,
      schema: def?.settingsSchema ?? [],
      values: {
        ...section.settings,
        scheduledShow: section.scheduledShow ?? (section.settings?.scheduledShow as string | undefined),
        scheduledHide: section.scheduledHide ?? (section.settings?.scheduledHide as string | undefined),
      },
    };
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
  return <EditorIcon name="chevron_left" size={16} />;
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
