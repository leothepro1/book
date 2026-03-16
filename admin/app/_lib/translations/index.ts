// ── Translation system — public API ───────────────────────────

export type {
  ResourceId,
  TranslationNamespace,
  TranslationStatus,
  TranslatableField,
  TranslationContext,
  StoredTranslation,
  TranslationGroup,
  SectionTranslationGroup,
  TranslationStats,
  TranslationPanelData,
  PlatformStringDefinition,
  PlatformStringMap,
  TranslationSaveEntry,
} from "./types";

export { makeResourceId } from "./types";
export { SUPPORTED_LOCALES, PRIMARY_LOCALE, isValidLocale, getLocaleInfo } from "./locales";
export type { SupportedLocale } from "./locales";
export { computeDigest } from "./digest";
export { traverseConfig } from "./traversal";
export { scanTranslatableStrings } from "./scanner";
export { resolveTranslation } from "./resolve";
export { applyTranslationsToConfig } from "./merger";
export { platformStringMap } from "./platform-strings";
export { registerResourceType, getResourceTypes } from "./resource-types";
export type { TranslatableResourceType, TranslatableItem, TranslatableFieldDef } from "./resource-types";
