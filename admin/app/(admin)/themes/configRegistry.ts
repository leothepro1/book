/**
 * Section Config Card Registry
 *
 * Maps section TYPE → custom admin config card component.
 *
 * When a theme declares a section slot with type "hero-slider",
 * the admin configure view checks this registry for a matching
 * config card. If found, it renders the custom card; otherwise
 * it falls back to the generic schema-driven accordion.
 *
 * This is the admin-side counterpart to the guest-side section
 * registry. The guest registry maps type/variant → render component.
 * This registry maps type → config UI component.
 *
 * Pattern:
 *   registerSectionConfig("hero-slider", HeroSliderConfig);
 *   const Card = getSectionConfig("hero-slider");
 *
 * Config cards receive a standardised props contract and handle
 * their own field layout, grouping, previews, and validation.
 */

import type { ThemeSectionSlot, SettingField } from "@/app/(guest)/_lib/themes/types";

// ─── Props Contract ──────────────────────────────────────

/**
 * Universal props passed to every section config card.
 *
 * Config cards own their entire UI — they can render grouped
 * fields, inline previews, drag handles, etc. The only
 * requirement is calling `onChange(key, value)` for persistence.
 */
export type SectionConfigCardProps = {
  /** The section slot definition from the theme manifest. */
  slot: ThemeSectionSlot;

  /** Current resolved values (defaults merged with tenant overrides). */
  values: Record<string, unknown>;

  /** Callback to persist a single field change. */
  onChange: (key: string, value: unknown) => void;

  /** The slot's schema (convenience — also available via slot.schema). */
  schema: SettingField[];
};

export type SectionConfigCard = React.ComponentType<SectionConfigCardProps>;

// ─── Registry ────────────────────────────────────────────

const configCards = new Map<string, SectionConfigCard>();

/**
 * Register a custom config card for a section type.
 *
 * Call at module scope — the card is available immediately.
 * If a card is already registered for this type, it is replaced
 * (last-write-wins, useful for overrides/plugins).
 */
export function registerSectionConfig(
  sectionType: string,
  component: SectionConfigCard,
): void {
  if (!sectionType) {
    throw new Error(
      "[ConfigRegistry] Invalid registration: sectionType must be non-empty.",
    );
  }
  configCards.set(sectionType, component);
}

/**
 * Look up a custom config card for a section type.
 * Returns undefined if no custom card is registered (use generic fallback).
 */
export function getSectionConfig(
  sectionType: string,
): SectionConfigCard | undefined {
  return configCards.get(sectionType);
}

/**
 * Check if a custom config card exists for a section type.
 */
export function hasSectionConfig(sectionType: string): boolean {
  return configCards.has(sectionType);
}
