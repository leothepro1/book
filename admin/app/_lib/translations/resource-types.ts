// ── Translatable Resource Type Registry ───────────────────────
//
// Declarative system for extending the translation system to new
// content types. Each resource type declares:
//   - How to extract items from TenantConfig
//   - What fields on each item are translatable
//   - The ResourceId pattern
//
// Adding a new translatable content type = adding one entry here.
// No changes to traversal, scanner, merger, or API routes needed.
//
// Shopify model: Pages, Products, Menus, Metafields — each is a
// resource type. We follow the same pattern.

import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { TranslationNamespace } from "./types";

// ── Types ────────────────────────────────────────────────────

export interface TranslatableFieldDef {
  /** Key in the item's data object */
  key: string;
  /** Field type — must be in TRANSLATABLE_FIELD_TYPES */
  type: "text" | "textarea" | "richtext";
  /** Human-readable label shown in translation panel */
  label: string;
}

export interface TranslatableItem {
  /** Unique ID of this item (used in ResourceId) */
  id: string;
  /** Human-readable name (shown in translation panel sidebar/grouping) */
  name: string;
  /** The raw data object containing translatable fields */
  data: Record<string, unknown>;
  /** Nested items (e.g. markers inside a map) */
  children?: TranslatableItem[];
  /** Field definitions for children (if different from parent) */
  childFields?: TranslatableFieldDef[];
  /** Child type label for ResourceId (e.g. "marker") */
  childType?: string;
}

export interface TranslatableResourceType {
  /** Unique ID (e.g. "pages", "maps", "menus") */
  id: string;
  /** Human-readable label for the translation panel sidebar */
  label: string;
  /** Material Symbols icon name */
  icon: string;
  /** Translation namespace for this resource type */
  namespace: TranslationNamespace;
  /** ResourceId prefix segment (e.g. "map", "menu") */
  resourceIdSegment: string;
  /** Fields translatable on each top-level item */
  fields: TranslatableFieldDef[];
  /** Extract items from TenantConfig */
  extract: (config: TenantConfig) => TranslatableItem[];
}

// ── Registry ─────────────────────────────────────────────────

const registry: TranslatableResourceType[] = [];

export function registerResourceType(type: TranslatableResourceType): void {
  registry.push(type);
}

export function getResourceTypes(): readonly TranslatableResourceType[] {
  return registry;
}

// ── Built-in resource types ──────────────────────────────────

// Maps — markers with title, content, buttonLabel
registerResourceType({
  id: "maps",
  label: "Kartor",
  icon: "map",
  namespace: "TENANT",
  resourceIdSegment: "map",
  fields: [], // Map itself has no translatable fields
  extract: (config) => {
    const maps = (config as Record<string, unknown>).maps as Array<Record<string, unknown>> | undefined;
    if (!maps || !Array.isArray(maps)) return [];

    return maps.map((map) => ({
      id: map.id as string,
      name: (map.name as string) ?? "Karta",
      data: map,
      childType: "marker",
      childFields: [
        { key: "title", type: "text" as const, label: "Titel" },
        { key: "content", type: "richtext" as const, label: "Innehåll" },
        { key: "buttonLabel", type: "text" as const, label: "Knappetikett" },
      ],
      children: ((map.markers as Array<Record<string, unknown>>) ?? [])
        .filter((m) => m.type !== "category") // categories are groupings, not translatable
        .map((marker) => ({
          id: marker.id as string,
          name: (marker.title as string) ?? "Markör",
          data: marker,
        })),
    }));
  },
});

// Menus — menu title + item labels
registerResourceType({
  id: "menus",
  label: "Menyer",
  icon: "menu_book",
  namespace: "TENANT",
  resourceIdSegment: "menu",
  fields: [{ key: "title", type: "text" as const, label: "Menynamn" }],
  extract: (config) => {
    const menus = (config as Record<string, unknown>).menus as Array<Record<string, unknown>> | undefined;
    if (!menus || !Array.isArray(menus)) return [];

    return menus.map((menu) => ({
      id: menu.id as string,
      name: (menu.title as string) ?? "Meny",
      data: menu,
      childType: "item",
      childFields: [
        { key: "label", type: "text" as const, label: "Namn" },
      ],
      children: ((menu.items as Array<Record<string, unknown>>) ?? []).map((item) => ({
        id: item.id as string,
        name: (item.label as string) ?? "Menyobjekt",
        data: item,
      })),
    }));
  },
});
