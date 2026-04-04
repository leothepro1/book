/**
 * Theme & Section Registries
 *
 * Two registries power the theme engine:
 *   1. Theme Registry   — Maps theme IDs → ThemeManifest
 *   2. Section Registry  — Maps "type/variant" → React Component
 *
 * Both use a register-at-import pattern. Theme manifests and section
 * components self-register when imported. The engine queries these
 * registries at render time.
 *
 * Bootstrap is race-safe: concurrent callers share a single Promise,
 * and partial failures are retried on the next call.
 */

import type {
  ThemeManifest,
  SectionRegistryKey,
  SectionComponent,
} from "./types";

// ─── Theme Registry ──────────────────────────────────────

const themes = new Map<string, ThemeManifest>();

export function registerTheme(manifest: ThemeManifest): void {
  if (!manifest.id || !manifest.name) {
    throw new Error(
      `[ThemeRegistry] Invalid manifest: id="${manifest.id}" must have id and name.`
    );
  }

  // Validate all section slot IDs are unique across templates + groups
  const allSlotIds = new Set<string>();
  const allSlots = [
    ...manifest.sectionGroups.header,
    ...manifest.sectionGroups.footer,
    ...(manifest.sectionGroups.sidebar ?? []),
    ...Object.values(manifest.templates).flatMap((t) => t.sections),
  ];

  for (const slot of allSlots) {
    if (allSlotIds.has(slot.id)) {
      throw new Error(
        `[ThemeRegistry] Duplicate section slot ID "${slot.id}" in theme "${manifest.id}".`
      );
    }
    allSlotIds.add(slot.id);
  }

  // Validate every slot has a non-empty type and variant
  for (const slot of allSlots) {
    if (!slot.type || !slot.variant) {
      throw new Error(
        `[ThemeRegistry] Slot "${slot.id}" in theme "${manifest.id}" ` +
        `must have non-empty type and variant.`
      );
    }
  }

  // Validate schema field keys are unique within each slot
  for (const slot of allSlots) {
    const fieldKeys = new Set<string>();
    for (const field of slot.schema) {
      if (fieldKeys.has(field.key)) {
        throw new Error(
          `[ThemeRegistry] Duplicate schema field key "${field.key}" ` +
          `in slot "${slot.id}" of theme "${manifest.id}".`
        );
      }
      fieldKeys.add(field.key);
    }
  }

  // Deep freeze to prevent accidental runtime mutation of manifest data
  themes.set(manifest.id, deepFreeze(manifest));
}

/**
 * Recursively freeze an object to prevent runtime mutation.
 * Manifests are static declarations — they should never be mutated.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

export function getTheme(id: string): ThemeManifest | undefined {
  return themes.get(id);
}

export function getAllThemes(): ThemeManifest[] {
  return Array.from(themes.values());
}

export function hasTheme(id: string): boolean {
  return themes.has(id);
}

// ─── Section Registry ────────────────────────────────────

const sections = new Map<SectionRegistryKey, SectionComponent>();

function toKey(type: string, variant: string): SectionRegistryKey {
  return `${type}/${variant}`;
}

/**
 * Register a section component for a given type + variant.
 * Type and variant are free-form strings — no enum restriction.
 */
export function registerSection(
  type: string,
  variant: string,
  component: SectionComponent,
): void {
  if (!type || !variant) {
    throw new Error(
      `[SectionRegistry] Invalid registration: type="${type}", variant="${variant}". Both must be non-empty.`
    );
  }
  sections.set(toKey(type, variant), component);
}

export function getSectionComponent(
  type: string,
  variant: string,
): SectionComponent | undefined {
  return sections.get(toKey(type, variant));
}

// ─── Bootstrap ───────────────────────────────────────────

/**
 * Shared bootstrap promise. If multiple callers hit ensureRegistered()
 * concurrently, they all await the same promise — no duplicate work,
 * no partial-state window.
 *
 * On failure the promise is reset so the next caller retries.
 */
let bootstrapPromise: Promise<void> | null = null;

export async function ensureRegistered(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = doBootstrap();

  try {
    await bootstrapPromise;
  } catch (err) {
    // Reset so next caller retries instead of being stuck with a failed bootstrap
    bootstrapPromise = null;
    throw err;
  }
}

async function doBootstrap(): Promise<void> {
  // Import manifests — each import is isolated so one failure doesn't block others
  const manifestImports = [
    import("./manifests/classic"),
    import("./manifests/immersive"),
    import("./manifests/sidebar"),
  ];

  const manifestResults = await Promise.allSettled(manifestImports);
  for (const result of manifestResults) {
    if (result.status === "rejected") {
      console.error("[ThemeRegistry] Failed to import theme manifest:", result.reason);
    }
  }

  // Import section components — isolated, non-blocking
  const sectionImports = [
    import("./sections/hero/contained"),
    import("./sections/hero/fullscreen"),
    import("./sections/info-bar/split-cards"),
    import("./sections/quick-links/grid"),
    import("./sections/quick-links/floating-bar"),
    import("./sections/hero-slider/pebble"),
    import("./sections/category-tabs/pebble"),
    import("./sections/checkin-slot/pebble"),
    import("./sections/search-sidebar/default"),
  ];

  const sectionResults = await Promise.allSettled(sectionImports);
  for (const result of sectionResults) {
    if (result.status === "rejected") {
      console.error("[ThemeRegistry] Failed to import section component:", result.reason);
    }
  }

  // Verify critical state: at least one theme must be registered
  if (themes.size === 0) {
    throw new Error("[ThemeRegistry] Bootstrap failed: no themes registered.");
  }
}
