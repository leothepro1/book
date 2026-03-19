/**
 * Check-In Cards — Definition Registry
 * ═════════════════════════════════════
 *
 * Static registry of platform-defined check-in cards.
 * Deep-frozen at registration — immutable at runtime.
 * Same pattern as section/element registries.
 *
 * Shared code (server + client). No React imports.
 */

import type { CheckinCardId, CheckinCardDefinition, CheckinCardConfig } from "./types";

// ── Registry ─────────────────────────────────────────────────

const definitions = new Map<CheckinCardId, CheckinCardDefinition>();

export function registerCheckinCard(def: CheckinCardDefinition): void {
  if (definitions.has(def.id)) {
    throw new Error(`[CheckinCardRegistry] Card "${def.id}" already registered.`);
  }
  definitions.set(def.id, Object.freeze({ ...def }));
}

export function getCheckinCardDefinition(id: CheckinCardId): CheckinCardDefinition | undefined {
  return definitions.get(id);
}

export function getAllCheckinCardDefinitions(): readonly CheckinCardDefinition[] {
  return Object.freeze([...definitions.values()]);
}

// ── Default Config ───────────────────────────────────────────

/**
 * Generate the default card config from registered definitions.
 * Used when a tenant has no explicit check-in card config.
 */
export function getDefaultCheckinCardConfig(): CheckinCardConfig {
  const allDefs = getAllCheckinCardDefinitions();
  const sorted = [...allDefs].sort((a, b) => a.defaultSortOrder - b.defaultSortOrder);
  return {
    cardOrder: sorted.map((d) => d.id),
  };
}

// ── Resolution ───────────────────────────────────────────────

/**
 * Resolve which cards are active and in what order.
 *
 * Rules:
 *   - Cards appear in cardOrder sequence
 *   - Missing cards in cardOrder are appended in defaultSortOrder
 *   - optional: false cards are always included (tenant toggle ignored)
 *   - Only cards listed in cardOrder are shown
 */
export function resolveActiveCards(
  config: CheckinCardConfig,
): CheckinCardDefinition[] {
  const allDefs = getAllCheckinCardDefinitions();
  const defMap = new Map(allDefs.map((d) => [d.id, d]));

  // cardOrder is the source of truth for which cards are active.
  // Only cards listed in cardOrder are shown.
  const orderedIds = [...config.cardOrder];

  return orderedIds
    .map((id) => {
      const def = defMap.get(id);
      if (!def) return null;

      // Apply tenant optional override if present
      const optionalOverride = config.cardOptional?.[id];
      if (optionalOverride !== undefined) {
        return { ...def, optional: optionalOverride };
      }
      return def;
    })
    .filter((def): def is CheckinCardDefinition => def !== null);
}
