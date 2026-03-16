// ── Translation system types ──────────────────────────────────
//
// ResourceId format:
//   {namespace}:{scope}:{...path}:{fieldName}
//
// See CLAUDE.md Translation System Brief §2 for full spec.

import type { SupportedLocale } from "./locales";

// ── Branded ResourceId ───────────────────────────────────────

export type ResourceId = string & { readonly __brand: "ResourceId" };

export function makeResourceId(raw: string): ResourceId {
  return raw as ResourceId;
}

// ── Namespace ────────────────────────────────────────────────

export type TranslationNamespace = "PLATFORM" | "TENANT" | "LOCKED";

// ── Translation status ───────────────────────────────────────

export type TranslationStatus = "TRANSLATED" | "OUTDATED" | "MISSING";

// ── Scanner output ───────────────────────────────────────────

export interface TranslationContext {
  pageId?: string;
  pageName?: string;
  sectionId?: string;
  sectionName?: string;
  blockId?: string;
  elementId?: string;
  fieldLabel: string;
}

export interface TranslatableField {
  resourceId: ResourceId;
  namespace: TranslationNamespace;
  sourceValue: string;
  sourceDigest: string;
  translatedValue?: string;
  translationDigest?: string;
  status: TranslationStatus;
  context: TranslationContext;
}

// ── Stored translation row (matches Prisma shape) ────────────

export interface StoredTranslation {
  id: string;
  tenantId: string;
  locale: string;
  resourceId: string;
  namespace: TranslationNamespace;
  value: string;
  sourceDigest: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Translation group (API response shape) ───────────────────

export interface SectionTranslationGroup {
  sectionId: string;
  sectionName: string;
  fields: TranslatableField[];
}

export interface TranslationGroup {
  pageId: string;
  pageName: string;
  sections: SectionTranslationGroup[];
}

export interface TranslationStats {
  total: number;
  translated: number;
  outdated: number;
  missing: number;
}

export interface TranslationPanelData {
  locale: string;
  primaryLocale: SupportedLocale;
  groups: TranslationGroup[];
  globals: {
    header: TranslatableField[];
    footer: TranslatableField[];
  };
  stats: TranslationStats;
}

// ── Platform string definition ───────────────────────────────

export interface PlatformStringDefinition {
  resourceId: ResourceId;
  defaultTranslations: Partial<Record<SupportedLocale, string>>;
}

export type PlatformStringMap = Map<string, PlatformStringDefinition>;

// ── Bulk save request ────────────────────────────────────────

export interface TranslationSaveEntry {
  resourceId: ResourceId;
  value: string;
  sourceDigest: string;
}
