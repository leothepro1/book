// ── Config traversal utility ──────────────────────────────────
//
// Shared by scanner.ts and merger.ts. This is the ONLY code that
// knows how to walk a TenantConfig to find translatable strings.
// Browser-safe — no Node.js APIs.
//
// ONE traversal implementation. Scanner ignores setValue. Merger uses it.

import type { TenantConfig, HeaderConfig, PageFooterConfig } from "@/app/(guest)/_lib/tenant/types";
import type { SectionInstance, BlockInstance, ElementInstance } from "@/app/_lib/sections/types";
import type { PageId } from "@/app/_lib/pages/types";
import { getAllPageDefinitions } from "@/app/_lib/pages/registry";
import { getPageSections } from "@/app/_lib/pages/config";
import { getSectionDefinition, getElementDefinition } from "@/app/_lib/sections/registry";
import type { ResourceId, TranslationNamespace } from "./types";
import { getResourceTypes } from "./resource-types";
import { makeResourceId } from "./types";

// ── Namespace prefix mapping ─────────────────────────────────
// Explicit, typesafe mapping from enum to ResourceId prefix.
// Never derive from string transformation of enum values.

const NAMESPACE_PREFIX: Record<TranslationNamespace, string> = {
  PLATFORM: "platform",
  TENANT: "tenant",
  LOCKED: "locked",
} as const;

// ── Translatable field types ─────────────────────────────────
// Only these SettingFieldType values contain human-readable text.
const TRANSLATABLE_FIELD_TYPES = new Set(["text", "textarea", "richtext"]);

// ── Emitted field ────────────────────────────────────────────

export interface TraversalField {
  resourceId: ResourceId;
  namespace: TranslationNamespace;
  sourceValue: string;
  fieldLabel: string;
  pageId?: string;
  pageName?: string;
  sectionId?: string;
  sectionName?: string;
  blockId?: string;
  elementId?: string;
  /** Write a new value back to the config object. No-op on immutable configs. */
  setValue: (newValue: string) => void;
}

// ── Callback type ────────────────────────────────────────────

export type TraversalVisitor = (field: TraversalField) => void;

// ── Main traversal ───────────────────────────────────────────

/**
 * Pre-fetched items from DB-backed resource types.
 * Keyed by resource type ID (e.g. "products", "accommodations").
 * Populated by the scanner API route before calling traverseConfig.
 */
export type DbResourceItems = Map<string, import("./resource-types").TranslatableItem[]>;

export function traverseConfig(
  config: TenantConfig,
  visitor: TraversalVisitor,
  dbResourceItems?: DbResourceItems,
): void {
  // 1. Global header
  if (config.globalHeader) {
    traverseHeader(config.globalHeader, visitor);
  }

  // 2. Global footer
  if (config.globalFooter) {
    traverseFooter(config.globalFooter, visitor);
  }

  // 3. Pages — ordered by registry
  for (const pageDef of getAllPageDefinitions()) {
    const pageConfig = config.pages?.[pageDef.id as PageId];
    if (!pageConfig || pageConfig.enabled === false) continue;

    const sections = getPageSections(config, pageDef.id);
    for (const section of sections) {
      traverseSection(section, pageDef.id, pageDef.label, visitor);
    }
  }

  // 4. Registered resource types (maps, menus, products, accommodations, etc.)
  for (const resourceType of getResourceTypes()) {
    // DB-backed types use pre-fetched items; config-based types extract from config
    const items = resourceType.extractAsync
      ? (dbResourceItems?.get(resourceType.id) ?? [])
      : resourceType.extract(config);
    const prefix = NAMESPACE_PREFIX[resourceType.namespace];

    for (const item of items) {
      // Each top-level item = one sidebar entry (like a page)
      // pageId = item.id (unique per map/menu/product)
      // pageName = item.name (map name, product name, etc.)
      // sectionId/sectionName = resource type label (Karta, Produkt, etc.)

      // Top-level item fields
      for (const fieldDef of resourceType.fields) {
        const value = item.data[fieldDef.key];
        if (typeof value !== "string" || value.trim() === "") continue;

        const fieldKey = fieldDef.key;
        const rid = `${prefix}:${resourceType.resourceIdSegment}:${item.id}:${fieldKey}`;
        visitor({
          resourceId: makeResourceId(rid),
          namespace: resourceType.namespace,
          sourceValue: value,
          fieldLabel: fieldDef.label,
          pageId: item.id,
          pageName: item.name,
          sectionId: resourceType.id,
          sectionName: resourceType.label,
          setValue: (v) => { item.data[fieldKey] = v; },
        });
      }

      // Child items (e.g. markers inside a map)
      if (item.children && item.childFields && item.childType) {
        for (const child of item.children) {
          for (const fieldDef of item.childFields) {
            const value = child.data[fieldDef.key];
            if (typeof value !== "string" || value.trim() === "") continue;

            const fieldKey = fieldDef.key;
            const rid = `${prefix}:${resourceType.resourceIdSegment}:${item.id}:${item.childType}:${child.id}:${fieldKey}`;
            visitor({
              resourceId: makeResourceId(rid),
              namespace: resourceType.namespace,
              sourceValue: value,
              fieldLabel: `${child.name} — ${fieldDef.label}`,
              pageId: item.id,
              pageName: item.name,
              sectionId: resourceType.id,
              sectionName: resourceType.label,
              setValue: (v) => { child.data[fieldKey] = v; },
            });
          }
        }
      }
    }
  }
}

// ── Header traversal ─────────────────────────────────────────

function traverseHeader(_header: HeaderConfig, _visitor: TraversalVisitor): void {
  // TODO: emit translatable fields when HeaderConfig gains text fields.
  // Fields to add: logoAltText, navigationLabels (when implemented).
}

// ── Footer traversal ─────────────────────────────────────────

function traverseFooter(_footer: PageFooterConfig, _visitor: TraversalVisitor): void {
  // TODO: emit translatable fields when PageFooterConfig gains text fields.
  // Fields to add: tab labels, copyright text (when implemented).
}

// ── Section traversal ────────────────────────────────────────

function traverseSection(
  section: SectionInstance,
  pageId: string,
  pageName: string,
  visitor: TraversalVisitor,
): void {
  const definition = getSectionDefinition(section.definitionId);
  const sectionName = definition?.name ?? section.definitionId;
  const isLocked = section.locked === true;
  const namespace: TranslationNamespace = isLocked ? "LOCKED" : "TENANT";
  const prefix = NAMESPACE_PREFIX[namespace];
  const editableFields = definition?.editableFields;
  const ctx = { pageId, pageName, sectionId: section.id, sectionName };

  // NOTE: section.title and section.description are internal editor labels,
  // not guest-facing content. They are NOT translatable.

  // Section-level settings (translatable fields from settingsSchema)
  if (definition) {
    traverseSettings(
      section.settings,
      definition.settingsSchema,
      `${prefix}:page:${pageId}:section:${section.id}`,
      namespace, visitor, ctx,
      isLocked ? editableFields : undefined,
    );

    // Preset-specific settings
    const preset = definition.presets.find((p) => p.key === section.presetKey);
    if (preset) {
      traverseSettings(
        section.presetSettings,
        preset.settingsSchema,
        `${prefix}:page:${pageId}:section:${section.id}`,
        namespace, visitor, ctx,
        isLocked ? editableFields : undefined,
      );
    }
  }

  // Locked sections have no blocks to traverse
  if (isLocked) return;

  // Blocks
  for (const block of section.blocks ?? []) {
    traverseBlock(block, section, pageId, pageName, sectionName, visitor);
  }
}

// ── Block traversal ──────────────────────────────────────────

function traverseBlock(
  block: BlockInstance,
  section: SectionInstance,
  pageId: string,
  pageName: string,
  sectionName: string,
  visitor: TraversalVisitor,
): void {
  const baseId = `${NAMESPACE_PREFIX.TENANT}:page:${pageId}:section:${section.id}:block:${block.id}`;

  // Block-level settings
  const definition = getSectionDefinition(section.definitionId);
  if (definition) {
    const preset = definition.presets.find((p) => p.key === section.presetKey);
    if (preset) {
      const blockType = preset.blockTypes.find((bt) => bt.type === block.type);
      if (blockType) {
        traverseSettings(
          block.settings,
          blockType.settingsSchema,
          baseId,
          "TENANT",
          visitor,
          { pageId, pageName, sectionId: section.id, sectionName, blockId: block.id },
        );
      }
    }
  }

  // Elements in slots
  for (const [, elements] of Object.entries(block.slots)) {
    for (const element of elements) {
      traverseElement(element, block, section, pageId, pageName, sectionName, visitor);
    }
  }
}

// ── Element traversal ────────────────────────────────────────

function traverseElement(
  element: ElementInstance,
  block: BlockInstance,
  section: SectionInstance,
  pageId: string,
  pageName: string,
  sectionName: string,
  visitor: TraversalVisitor,
): void {
  const baseId = `${NAMESPACE_PREFIX.TENANT}:page:${pageId}:section:${section.id}:block:${block.id}:element:${element.id}`;

  // Element settings — get definition to know which fields are translatable
  const elementDef = getElementDefinition(element.type);

  if (elementDef) {
    traverseSettings(
      element.settings,
      elementDef.settingsSchema,
      baseId,
      "TENANT",
      visitor,
      {
        pageId,
        pageName,
        sectionId: section.id,
        sectionName,
        blockId: block.id,
        elementId: element.id,
      },
    );
  }
}

// ── Settings traversal (shared helper) ───────────────────────

interface SettingsContext {
  pageId?: string;
  pageName?: string;
  sectionId?: string;
  sectionName?: string;
  blockId?: string;
  elementId?: string;
}

function traverseSettings(
  settings: Record<string, unknown>,
  schema: { key: string; type: string; label: string; translatable?: boolean }[],
  resourceIdPrefix: string,
  namespace: TranslationNamespace,
  visitor: TraversalVisitor,
  context: SettingsContext,
  editableFieldFilter?: string[],
): void {
  for (const field of schema) {
    // Skip non-translatable field types
    if (!TRANSLATABLE_FIELD_TYPES.has(field.type)) continue;

    // Skip fields explicitly marked as non-translatable
    if (field.translatable === false) continue;

    // For locked sections, only traverse editable fields
    if (editableFieldFilter && !editableFieldFilter.includes(field.key)) continue;

    const value = settings[field.key];
    if (typeof value !== "string" || value.trim() === "") continue;

    const fieldKey = field.key;
    visitor({
      resourceId: makeResourceId(`${resourceIdPrefix}:${fieldKey}`),
      namespace,
      sourceValue: value,
      fieldLabel: field.label,
      ...context,
      setValue: (v) => { settings[fieldKey] = v; },
    });
  }
}
