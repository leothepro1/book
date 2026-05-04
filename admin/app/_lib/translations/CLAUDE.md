# Translation system

Enterprise-grade i18n infrastructure. Shopify-style content fingerprinting
with race-safe saves, self-healing staleness detection, and zero-downside
fallback. Translations are NOT stored in TenantConfig — they live in
separate DB tables keyed by ResourceId.

---

## Three namespaces

  PLATFORM — platform-authored strings (button labels, system messages).
             Base translations shipped in codebase. Tenant can override.
  TENANT   — tenant-authored content from the visual editor.
             Section headings, body text, CTA labels, image alt text.
  LOCKED   — editable fields in locked sections.
             Scoped by editableFields contract.

---

## ResourceId format

Deterministic, stable, branded string key per translatable field:

  tenant:page:{pageId}:section:{sectionId}:{fieldName}
  tenant:page:{pageId}:section:{sectionId}:block:{blockId}:{fieldName}
  tenant:page:{pageId}:section:{sectionId}:block:{blockId}:element:{elementId}:{fieldName}
  tenant:global:header:{fieldName}
  tenant:global:footer:{fieldName}
  locked:page:{pageId}:section:{sectionId}:{fieldName}
  platform:global:{key}
  platform:page:{pageId}:{key}

Uses sec_*/blk_*/elm_* identifiers — never positional indices.
ResourceId is immutable once created. Changing it is a migration.

---

## Content fingerprinting (staleness detection)

Every translation stores a `sourceDigest`: FNV-1a 32-bit hash (8-char hex)
of the source string at save time. On scan, current digest is compared:

  digest matches    → TRANSLATED (green)
  digest mismatch   → OUTDATED (orange) — source changed after translation
  no row exists     → MISSING (grey)

FNV-1a chosen over SHA-256 because it is synchronous. Scanner and merger
must run synchronously in both server and browser contexts.

---

## Core architecture — traversal is the single source of truth

`traversal.ts` is the ONLY code that walks TenantConfig to find
translatable strings. Scanner and merger both call `traverseConfig()`.

  traverseConfig(config, visitor) — emits TraversalField per translatable string
  TraversalField includes setValue(newValue) callback
  Scanner ignores setValue — reads sourceValue, computes digest, resolves status
  Merger uses setValue — applies translations to a structuredClone of config

ONE traversal. TWO consumers. ZERO duplication.

Only fields with type in ["text", "textarea", "richtext"] are translatable.
Fields with `translatable: false` on SettingField are excluded.
For locked sections, only fields in editableFields are emitted.
NAMESPACE_PREFIX constant maps enum → prefix string explicitly.

---

## Resource type registry (extensible content types)

Shopify model: Pages, Products, Menus — each is a resource type.
`resource-types.ts` is a declarative registry. Adding a new translatable
content type = adding one `registerResourceType()` call. No changes to
traversal, scanner, merger, or API routes needed.

Each resource type declares:
  id, label, icon, namespace, resourceIdSegment, fields, extract()
  extract() returns TranslatableItem[] from TenantConfig
  Items can have children (e.g. markers inside a map)

Built-in types:
  "maps" — config.maps[].markers[] → title, content, buttonLabel

ResourceId format for resource types:
  tenant:{segment}:{itemId}:{fieldName}
  tenant:{segment}:{itemId}:{childType}:{childId}:{fieldName}

Key file: `app/_lib/translations/resource-types.ts`

---

## Fallback chain (booking engine render)

  1. Tenant translation for requested locale
  2. Platform default for requested locale (PLATFORM namespace only)
  3. Tenant translation for primary locale
  4. Platform default for primary locale
  5. Raw sourceValue from TenantConfig (always exists, never undefined)

All translations loaded in ONE findMany query — never N+1.

---

## Database models

  TenantLocale — locale, published, primary per tenant
    @@unique([tenantId, locale])
    @@index([tenantId, published])

  TenantTranslation — resourceId, value, sourceDigest per locale per tenant
    @@unique([tenantId, locale, resourceId])
    @@index([tenantId, locale])
    @@index([tenantId, resourceId])

  TranslationNamespace enum — PLATFORM, TENANT, LOCKED

---

## Key files

- Types: `app/_lib/translations/types.ts`
- Locales: `app/_lib/translations/locales.ts`
- Digest: `app/_lib/translations/digest.ts`
- Traversal: `app/_lib/translations/traversal.ts`
- Scanner: `app/_lib/translations/scanner.ts`
- Resolve: `app/_lib/translations/resolve.ts`
- Merger: `app/_lib/translations/merger.ts`
- Platform strings: `app/_lib/translations/platform-strings.ts`
- Config channel: `app/_lib/translations/config-channel.ts`
- Locale cache: `app/_lib/translations/locale-cache.ts`
- Settings UI: `app/(admin)/settings/languages/`
- API routes: `app/api/translations/`

---

## API routes

- `GET  /api/translations/locales` — list tenant locales
- `POST /api/translations/locales` — add locale (idempotent)
- `PATCH /api/translations/locales/[locale]` — publish/unpublish
- `DELETE /api/translations/locales/[locale]` — atomic delete locale + translations
- `GET  /api/translations/[locale]` — scan + load translation panel data
- `PUT  /api/translations/[locale]` — bulk save with digest conflict detection (409)
- `POST /api/translations/[locale]/cleanup` — orphan cleanup (synchronous)
- `GET  /api/translations/locales/published` — internal route for middleware

---

## Middleware locale handling

URL pattern: /p/[token]/[locale]/... → rewrite to /p/[token]/...
Locale detected via regex, validated against published state via internal
API route (middleware runs in Edge runtime, cannot import prisma).
locale-cache.ts is Edge-safe (pure in-memory, no DB imports).
Cache invalidated on PATCH/DELETE via invalidateLocaleCache().

---

## Live mirroring (editor → translation panel)

configChannel — module-level pub/sub, no React, bridges PreviewContext tree
and SettingsPanel tree (which are separate React trees).

PreviewContext emits configChannel.emit(config) on every config change.
TranslationPanel subscribes with stable useEffect([locale]) — uses dataRef
to avoid infinite re-subscription. Debounces 300ms. editingFieldsRef
protects unsaved user edits from being overwritten during mirror updates.

---

## Race safety mechanisms

1. Optimistic locking on publish (settingsVersion)
2. Digest conflict on translation save (409 Conflict with new source)
3. Bulk save atomicity (deleteMany + createMany in $transaction)
4. Atomic locale deletion ($transaction)
5. Published cache invalidation (10s TTL + explicit invalidate)
6. Stable channel subscription (dataRef, not data in deps)
7. Editing field protection (editingFieldsRef + isEditingRef per field)

---

## Orphan cleanup

Triggered after every publishDraft(). Scans published config, collects
current resourceIds, deletes translations with orphaned resourceIds.
Runs synchronously — cleanup is a simple deleteMany, fast enough to
not block the publish response. Failure is caught and logged, never
blocks publish success.

---

## Translation invariants — never violate these

1. traversal.ts is the ONLY code that walks config for translatable strings
2. ResourceId format is immutable — changing it requires a migration
3. Translations are NEVER stored in TenantConfig JSON
4. One bulk query per render — never N+1
5. Digest validation on save — server re-computes, client digest is a hint
6. Locale published state gates URL access — unpublished = 404
7. Cleanup is synchronous and non-blocking to publish success
8. Scanner and merger are browser-safe — no Node.js APIs
9. Swedish (sv) is always primary — cannot be removed or unpublished
10. Atomic locale deletion — locale + all translations in one transaction
11. configChannel has no React dependencies — pure module-level pub/sub
