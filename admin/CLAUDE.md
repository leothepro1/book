# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this project is

A hospitality SaaS platform where hotels and resorts create a guest portal
for their visitors. Guests receive a magic link and access a personalized
portal to view bookings, check in, access services, and contact the hotel.

The tenant configures the portal using a visual editor — the core product.
Think Shopify's theme editor, purpose-built for guest journey portals.

The platform is intentionally controlled. Tenants cannot create arbitrary
pages or layouts. Everything is platform-defined and architecturally constrained.

---

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind / CSS modules — BEM-style class naming
- Prisma + PostgreSQL (Render) — NEVER reset or delete production data
- Clerk for auth (skipped in dev via devAuth.ts)
- Cloudinary for media
- Resend for transactional email
- Material Symbols Rounded for icons
- Deployed on Vercel (bedfront.com, *.bedfront.com wildcard)

## Development

- `cd admin && npm run dev` — start dev server (Turbopack)
- `npm run build` — prisma generate + next build
- `npm run lint` — ESLint
- `npm run test` — vitest run
- `npm run test:watch` — vitest watch mode
- `npm run db:migrate` — prisma migrate dev
- `npm run db:seed` — prisma db seed
- `npx prisma generate` — regenerate Prisma client after schema changes
- Language convention: Swedish UI labels, English code and comments
- **Dev server restart procedure — ALWAYS follow ALL steps:**
  1. `fuser -k 3000/tcp 3001/tcp` — kill processes on ports
  2. Wait for ports to actually free: `fuser 3000/tcp` must return empty
  3. `rm -rf .next` — delete cache completely
  4. ONLY THEN start `npm run dev`
  Never skip step 2 or 3. Never start a new server while old ports are
  occupied. If the user says it's broken, it IS broken — trust them.

## Three surfaces

1. Admin editor — tenants design the portal
2. Guest portal — what guests see
3. Platform backend

Editor and guest portal share configuration models.

---

## TenantConfig — v2 shape

TenantConfig is stored as JSON in Prisma `Tenant.settings`.

Per-page data:
  config.pages[pageId].sections     ← section instances
  config.pages[pageId].layoutId     ← active layout variant
  config.pages[pageId].enabled      ← page active state

Global (shared across all pages):
  config.globalHeader               ← one HeaderConfig, all pages share it
  config.globalFooter               ← one FooterConfig, all pages share it
  config.colorSchemes               ← global color scheme definitions

Legacy v1 shape (config.home.*) is migrated automatically on load
via migrateToV2Pages() — idempotent, runs on every getTenantConfig() call.

**config.ts is the ONLY file that reads or writes config paths.**
Never access config.pages[x] or config.globalHeader directly outside config.ts.
All reads and writes go through typed accessor functions.

---

## Page registry

PAGE_REGISTRY is the single source of truth for all page logic.

Each PageDefinition:
  id: PageId (string literal union — not plain string)
  slug, availableLayouts, defaultLayout
  editorVisible: boolean
  header: boolean
  body: "sections" | "fixed"
  footer: boolean
  requiresFeatureFlag?: string

Current pages: home, stays, account, check-in, help-center, support

Tenants cannot create or delete pages.
Tenants can switch layouts on editorVisible pages.
No page IDs are hardcoded in shared code — always reference PAGE_REGISTRY.

---

## Visual editor structure

Left panel (sp-list):
  Sidhuvud — header singleton
  Mall — section builder
  Sidfot — footer singleton

Canvas: live portal preview
Right panel: DetailPanel — configuration panels

Edit pipeline:
  pushUndo(snapshot) → updateConfig() → saveDraft()

Undo snapshots are page-scoped to prevent multi-tab overwrite.
PreviewContext.config is the single source of truth for editor state.

---

## Section builder — Section → Block → Element

Section — top-level layout unit
Block — groups content inside a section
Element — smallest renderable unit

Sections can have multiple presets with their own renderers.

**Two section types:**

1. Free sections — home page only, tenant can add/remove/reorder freely
2. Locked sections — platform-owned, bound to a specific page

Locked section rules:
- scope: "locked", lockedTo: PageId in SectionDefinition
- locked: true, blocks: [] on SectionInstance — no tree structure
- Auto-seeded on first editor load for that page
- editableFields: string[] is the platform-admin contract
- DetailPanel renders ONLY controls in editableFields — generic, no
  section-specific conditionals in shared code
- Tenant can toggle visibility but cannot delete, add, or reorder
- Hidden from section picker — cannot be manually added
- visibleWhen: { key, value } on SettingsField controls conditional
  field visibility (e.g. tab labels hidden when layout === "list")

### Standalone elements

Elements can be placed directly in the page tree without a parent section.
Under the hood, they are wrapped in a SectionInstance with
`definitionId: "__standalone"` — invisible to the user.

- `createStandaloneSection()` in mutations.ts creates the wrapper
- Zero padding, no section styling — renders "naked"
- In editor: flat row (no chevron), shows element icon/name
- Color scheme selector appears on element panel (not section)
- DnD works automatically (it's a real SectionInstance)

---

## Creating section definitions — complete pattern

Every new section follows this exact structure. Copy an existing
definition (e.g. accordion.ts) and adapt.

### File structure

```
app/_lib/sections/definitions/{section-name}.ts    ← definition + registration
app/(guest)/_components/sections/renderers/
  {SectionName}Renderer.tsx                         ← React component (client)
  {section-name}-renderer.css                       ← CSS (BEM: .s-{name})
```

### SectionDefinition fields

```typescript
{
  id: string,                    // kebab-case, unique
  version: "1.0.0",
  name: string,                  // Swedish UI label
  description: string,           // for picker tooltip
  category: "hero" | "navigation" | "content" | "media" | "utility",
  tags: string[],                // searchable keywords
  thumbnail: "",                 // URL for picker
  scope: "free" | "locked",     // free = tenant can add/remove

  settingsSchema: SettingField[],     // section-level controls
  settingDefaults: Record<string, unknown>,

  presets: SectionPreset[],           // min 1, first is default
  createDefault: () => Omit<SectionInstance, "id" | "sortOrder">,
}
```

Register at end of file: `registerSectionDefinition(mySection);`

### SectionPreset fields

```typescript
{
  key: string,                   // unique within section
  version: "1.0.0",
  name: string,                  // Swedish
  description: string,
  thumbnail: "",
  cssClass: "s-{sectionId}--{presetKey}",  // BEM convention

  blockTypes: BlockTypeDefinition[],  // min 1
  minBlocks: number,
  maxBlocks: number,             // -1 = unlimited

  settingsSchema: SettingField[],     // preset-specific controls
  settingDefaults: Record<string, unknown>,

  changeStrategy: "reset" | "migrate" | "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => Omit<BlockInstance, "id">[],
}
```

### BlockTypeDefinition → SlotDefinition → Elements

```typescript
// Block type
{
  type: string,                  // unique within preset
  version: "1.0.0",
  name: string,  description: string,  icon: string,
  slots: SlotDefinition[],
  settingsSchema: [],  settingDefaults: {},
}

// Slot
{
  key: string,                   // "media" | "content" | "actions" etc.
  name: string,  description: string,
  allowedElements: ElementType[],
  minElements: number,  maxElements: number,  // -1 = unlimited
  defaultElements: Omit<ElementInstance, "id">[],  // id: "" → generated
}
```

### Color scheme rules — NEVER violate

1. **NEVER hardcode hex colors** in renderers — always use CSS variables
2. Color ownership lives at section level (`section.colorSchemeId`)
3. Standalone elements get their own colorSchemeId on the wrapper section
4. Available CSS variables from color scheme:
   - `var(--background)` — section/card background
   - `var(--text)` — primary text color
   - `var(--button-bg)` — solid button background
   - `var(--button-fg)` — solid button label
   - `var(--outline-btn)` — outline button border + text
   - `var(--outline-btn-label)` — outline button label
5. Derived colors use `color-mix()`:
   `color-mix(in srgb, var(--text) 12%, transparent)` for borders
   `color-mix(in srgb, var(--text) 4%, var(--background))` for tinted bg
6. Renderers receive `colorScheme` in props but should NOT read it
   directly — use the CSS variables that SectionItem applies

### Typography rules

1. Use `clamp()` for responsive sizing:
   `clamp(1.5rem, 1.25rem + 1vw, 2rem)` — never fixed px for headings
2. Font families via CSS variables:
   - `var(--font-heading)` — headings
   - `var(--font-body)` — body text
   - `var(--font-button, var(--font-heading, inherit))` — buttons
3. Text color: always `var(--text)`, never hardcoded

### Renderer component pattern

```typescript
"use client";  // REQUIRED — renderers use hooks

export function MyRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;
  // ...render using CSS variables, never hardcoded colors
}
```

Renderers receive fully resolved, validated data via `SectionRendererProps`.
They never contain fallback logic or default handling.

### SettingField types available

text, textarea, richtext, image, color, select, segmented,
toggle, number, range, url, link, cornerRadius, weightRange,
markers, mapPicker, video, imageList, layoutPicker, menuPicker

Key field props: key, type, label, default, options (for select/segmented),
min/max/step (for range), group (visual divider), hidden, hideLabel,
visibleWhen: { key, value } (conditional visibility), translatable

### Registration checklist

1. Create definition file in `definitions/`
2. Register with `registerSectionDefinition()`
3. Create renderer in `renderers/`
4. Create CSS file with BEM classes `.s-{name}`
5. Import CSS in renderer
6. All colors via CSS variables — zero hardcoded values
7. All text sizes via clamp() or design tokens
8. Test: add section in editor, verify preview renders correctly

---

## ID conventions

```
sec_${timestamp}_${random}   — sections
blk_${timestamp}_${random}   — blocks
elm_${timestamp}_${random}   — elements
```

---

## Color scheme system

Shopify-style. Defined globally by tenant.

Semantic tokens: background, text, solidButtonBackground,
solidButtonLabel, outlineButton, outlineButtonLabel

Sections assign a color scheme.
Renderer maps tokens to CSS variables: --background, --text, --button-bg, --button-fg
Elements inherit — elements do NOT own their own colors.
Color ownership lives at the section level.
Referenced schemes cannot be deleted.

---

## Header and footer

Both are global singletons stored in config.globalHeader / config.globalFooter.
NOT per-page. NOT sections. No blocks or elements.
Editing header/footer on any page updates it everywhere.
Each has a dedicated editor panel.

---

## Key files

- Page types: `app/_lib/pages/types.ts`
- Page registry: `app/_lib/pages/registry.ts`
- Config accessors: `app/_lib/pages/config.ts`
- Migration: `app/_lib/pages/migrate.ts`
- TenantConfig types: `app/(guest)/_lib/tenant/types.ts`
- Theme engine: `app/(guest)/_lib/themes/engine.tsx`
- Config loading: `app/(guest)/_lib/tenant/getTenantConfig.ts`
- Section definitions: `app/_lib/sections/definitions/`
- Element definitions: `app/_lib/sections/elements/`
- Editor: `app/(editor)/editor/`
- Env validation: `app/_lib/env.ts`
- Portal slug/email: `app/_lib/tenant/portal-slug.ts`
- Email module: `app/_lib/email/`
- Magic link: `app/_lib/magic-link/`
- Email triggers: `app/_lib/integrations/sync/email-triggers.ts`

---

## API routes

- `/api/media` — CRUD + thumbnails + stats + cleanup
- `/api/tenant/draft-config` — save unpublished config
- `/api/tenant/preview-stream` — live preview SSE
- `/api/webhooks/clerk` — org/user sync (Svix verification)
- `/api/webhooks/resend` — email delivery status (Svix verification)
- `/api/wallet-card-design` — Apple/Google Wallet styling
- `/api/email-templates` — template CRUD + preview + test send
- `/api/admin/backfill-portal-slugs` — one-time slug backfill (CRON_SECRET)
- `/api/admin/backfill-email-from` — one-time emailFrom backfill (CRON_SECRET)

---

## PMS integration layer

Aggregator pattern — normalizes data from multiple hotel systems (Mews,
Apaleo, Opera) into a canonical format. Hotels connect once, platform
works with normalized data everywhere.

### Adapter contract

Every PMS implements PmsAdapter interface:
  getBookings, syncBookings, testConnection, notifyCheckIn/Out,
  verifyWebhookSignature

`resolveAdapter(tenantId)` is the ONLY entry point for platform code.
Never call PMS APIs directly. Registry maps provider → adapter instance.

Implemented: Mews (production), Fake (dev/test), Manual (no external PMS)
Planned: Apaleo, Opera

### Credentials & encryption

AES-256-GCM encryption (crypto.ts). 12-byte IV, 16-byte auth tag.
Key: INTEGRATION_ENCRYPTION_KEY env var (min 32 chars).
Credentials never logged, never returned to client in cleartext.
Sensitive fields masked as "••••••••••••••••" in UI.

### Sync machinery

Three cron endpoints drive all syncing:
  /api/integrations/poll     — every 5 min, enqueue stale syncs + recover stuck jobs
  /api/integrations/run-jobs — every 1 min, claim and execute pending jobs
  /api/integrations/cleanup  — daily 03:00, purge old events/jobs/dedup records

All secured with x-cron-secret header.

Sync lifecycle:
  Poll creates job (pending) → run-jobs claims atomically (prevents double-exec)
  → circuit breaker check → runSyncJob() → adapter.syncBookings()
  → upsertSyncedBooking() per booking (idempotent) → recordSuccess/Failure

### Resilience layers

1. Rate limiting — DB-backed token bucket (200 req/30s per accessToken).
   Key is SHA-256 of token. Survives serverless cold starts.
2. Circuit breaker — consecutiveFailures counter on TenantIntegration.
   Opens after 5 failures → status = "error". Resets on 1 success.
3. Stuck job recovery — Poll detects running > 10 min → resets to pending.
4. Idempotent upsert — lastSyncedAt prevents webhook + poller race.
5. Webhook dedup — WebhookDedup table with unique dedupKey.
6. Individual error tracking — BookingSyncError per booking, max 5 retries.
7. Retry with backoff — 2^attempt × 60s + jitter, max 30 min.

### Data models

  TenantIntegration — 1:1 with Tenant. Provider, encrypted creds, status, circuit breaker
  SyncJob — queued sync jobs with status, attempt, backoff scheduling
  SyncEvent — append-only audit log (90d retention)
  BookingSyncError — per-booking error tracking with retry count
  RateLimit — token bucket per accessToken (DB-backed)
  WebhookDedup — dedup key per webhook event (7d retention)

### Key files

- Core types: `app/_lib/integrations/types.ts`
- Adapter interface: `app/_lib/integrations/adapter.ts`
- Registry: `app/_lib/integrations/registry.ts`
- Resolution: `app/_lib/integrations/resolve.ts`
- Mews adapter: `app/_lib/integrations/adapters/mews/`
- Sync engine: `app/_lib/integrations/sync/engine.ts`
- Scheduler: `app/_lib/integrations/sync/scheduler.ts`
- Circuit breaker: `app/_lib/integrations/sync/circuit-breaker.ts`
- Encryption: `app/_lib/integrations/crypto.ts`

### Integration invariants — never violate these

1. resolveAdapter(tenantId) is the only way to get an adapter
2. All PMS data normalized to NormalizedBooking / NormalizedGuest
3. Credentials encrypted at rest, decrypted only at call time
4. One bad booking never aborts entire sync
5. Sync jobs deduped — only one pending/running per tenant
6. lastSyncedAt prevents concurrent webhook + poller data races
7. Circuit breaker uses consecutive failures (works with backoff)
8. Fake adapter throws in production — dev/test only

---

## Clerk integration

### Auth layer

Production: Clerk handles sessions, JWT, cookies. auth() gives userId/orgId/orgRole.
Dev: devAuth.ts returns { userId: "dev_user", orgId: DEV_ORG_ID, orgRole: "org:admin" }.
DEV_OWNER_USER_ID substitutes the real org owner for Clerk API calls in dev.

### Role-based access

ADMIN_ROLE constant defined in roles.ts — single source of truth.
requireAdmin() guards all destructive server actions.
RoleContext provides isAdmin to client components.
Settings panel hides admin-only tabs via adminOnly flag on nav items.
Settings button hidden in sidebar for org:member.

### Organisation sync

Webhook handler (/api/webhooks/clerk) processes org.created/updated/deleted.
Svix signature verification + idempotency via WebhookEvent table.
Double-write strategy: direct DB write for immediate UI + webhook as safety net.

### Feature toggles

Account-level toggles stored as direct Tenant columns (not in JSON settings):
  checkinEnabled, checkoutEnabled — Boolean, immediate effect, no draft/publish.

### Tenant policies

TenantPolicy model — per-tenant policy documents (booking terms, house rules, etc.).
Unique constraint on [tenantId, policyId] for fast lookup.
Public API: getPublicPolicy(tenantSlug, policyId) — no auth required.

---

## Security invariants

- Env validation via Zod at boot — throws if required vars missing (env.ts)
- Webhook idempotency — svix-id checked before processing
- Error boundaries in (admin) and (editor) route groups
- No hardcoded secrets in source code
- No `as any` casts in config, accessor, or type layers
- All new types have Zod schemas

---

## Architectural principles — never violate these

1. config.ts is the only file that knows config paths
2. PAGE_REGISTRY is the only source of truth for page logic
3. Color ownership lives at the section level
4. Header/footer are global singletons — never per-page
5. Locked sections — editableFields is the platform-admin contract
6. No as any casts — types validated through accessor layer
7. Editor mirrors real rendering rules exactly
8. CSS variables instead of hardcoded colors
9. Tenants cannot create pages, layouts, or locked sections
10. Architecture scales to thousands of tenants — no tenant-specific code paths

When proposing solutions: prefer architecture over shortcuts, protect
system invariants, maintain backward compatibility, never duplicate config,
never bypass accessors, never hardcode page IDs in shared code.

---

## CSS reuse — MANDATORY

**Every CSS property must reuse existing design tokens and patterns.**
Never invent new colors, shadows, font sizes, spacing, border-radius,
transitions, or z-index values. The design system is fully defined —
use it.

### Design tokens (base.css)

All tokens live in `app/(admin)/base.css`. Always reference these variables:

**Colors:**
  --admin-bg, --admin-surface, --admin-surface-raised
  --admin-text, --admin-text-secondary, --admin-text-tertiary
  --admin-border, --admin-border-focus
  --admin-accent, --admin-accent-hover
  --admin-danger, --admin-danger-hover
  --admin-toggle-on, --admin-toggle-off

**Spacing** (8px base unit):
  --space-1 (4px), --space-2 (8px), --space-3 (12px),
  --space-4 (16px), --space-5 (20px), --space-6 (24px), --space-8 (32px)

**Border radius:**
  --radius-xs (4px), --radius-sm (6px), --radius-md (8px),
  --radius-lg (12px), --radius-xl (16px), --radius-full (999px)

**Shadows:**
  --admin-shadow-sm, --admin-shadow-md, --admin-shadow-card
  --shadow-dropdown, --shadow-modal, --shadow-panel

**Typography:**
  --font-xs, --font-sm, --font-md, --font-lg, --font-xl, --font-2xl
  Body: 13px/400, Labels: 12px/500, Headings: 16–22px/600

**Transitions:**
  --duration-fast, --duration-normal, --duration-slow
  --ease-default, --ease-spring, --ease-snappy

**Shared field tokens** (sf-* prefix for editor panels):
  --sf-input-height (36px), --sf-input-font-size (13px),
  --sf-color-swatch-size (36px), --sf-mono (monospace font stack)

### Existing component classes — ALWAYS reuse these

**Buttons:** .admin-btn, .admin-btn--outline, .admin-btn--accent,
  .admin-btn--danger, .admin-btn--danger-secondary, .admin-btn--ghost,
  .admin-btn--sm

**Inputs:** .admin-input--sm, .admin-input--compact,
  .admin-input--color-hex, .admin-textarea--sm, .admin-label--sm

**Dropdowns:** .admin-dropdown, .admin-dropdown__trigger,
  .admin-dropdown__list, .admin-dropdown__item,
  .admin-dropdown__item--active, .admin-dropdown__check

**Toggles:** .admin-toggle, .admin-toggle-on, .admin-toggle-thumb,
  .admin-toggle-icon, .admin-toggle--sm

**Range/Slider:** .admin-range, .admin-range-input-wrap, .admin-range-unit

**Color picker:** .sf-color-row, .sf-color-swatch, .cp-popup

**Labels & dividers:** .admin-field-label, .admin-hint,
  .admin-group-label (uppercase divider)

**Modals:** .settings-panel, .settings-panel__overlay,
  .settings-panel__content, .ml-modal

### Consistent interaction states

**Hover:** Use var(--admin-border-focus) for borders,
  var(--admin-surface-raised) or existing hover tokens for backgrounds.
**Active:** scale(0.96) for buttons, scale(0.92) for small elements.
**Disabled:** opacity: 0.5, cursor: not-allowed.
**Focus:** border-color + 3px ring using var(--admin-input-focus-ring).

### Rules — never break these

1. **NEVER hardcode** hex colors, pixel shadows, font sizes, spacing,
   or border-radius — always use CSS variables from base.css
2. **NEVER duplicate** an existing component class — if .admin-btn exists,
   use it; do not create a new button class
3. **NEVER create new modals/overlays** without reusing existing modal
   patterns (.settings-panel or .ml-modal)
4. **NEVER invent new hover/active/disabled** patterns — match existing
   interaction states exactly
5. **Check base.css first** before writing ANY new CSS property —
   if a token exists, use it
6. **BEM naming** — double underscore for children (__), double dash
   for modifiers (--), with component prefix matching existing patterns
7. **All new editor panel CSS** must use sf-* field tokens for inputs,
   labels, and controls to stay consistent with existing panels
8. When creating ANY file (HTML, CSS, TSX, or any other format), these
   rules apply — no exceptions

**Quality bar: "Would Shopify approve this?"**
Every change — no matter how small or complex — must meet Shopify-level
enterprise standards. Before considering any task done, ask: "Would Shopify
approve this?" If the answer is anything other than yes, it is not done.
This applies to scalability, robustness, race safety, error handling, UX
polish, code structure, and architectural decisions. No shortcuts, no
"good enough for now", no tech debt disguised as pragmatism.

This is not aspirational — it is the baseline. This platform is architecturally
equivalent to Shopify in its domain: Resend email integration, a visual editor
with draft/publish state, a theme library, multi-tenant infrastructure with
subdomain routing, and a section builder. The quality, architecture, and
attention to edge cases must match that level from the start. There is never
a valid reason to cut corners, skip edge cases, or ship something that would
not pass enterprise review. Every feature ships complete or not at all.

---

## Translation system

Enterprise-grade i18n infrastructure. Shopify-style content fingerprinting
with race-safe saves, self-healing staleness detection, and zero-downside
fallback. Translations are NOT stored in TenantConfig — they live in
separate DB tables keyed by ResourceId.

### Three namespaces

  PLATFORM — platform-authored strings (button labels, system messages).
             Base translations shipped in codebase. Tenant can override.
  TENANT   — tenant-authored content from the visual editor.
             Section headings, body text, CTA labels, image alt text.
  LOCKED   — editable fields in locked sections.
             Scoped by editableFields contract.

### ResourceId format

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

### Content fingerprinting (staleness detection)

Every translation stores a `sourceDigest`: FNV-1a 32-bit hash (8-char hex)
of the source string at save time. On scan, current digest is compared:

  digest matches    → TRANSLATED (green)
  digest mismatch   → OUTDATED (orange) — source changed after translation
  no row exists     → MISSING (grey)

FNV-1a chosen over SHA-256 because it is synchronous. Scanner and merger
must run synchronously in both server and browser contexts.

### Core architecture — traversal is the single source of truth

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

### Resource type registry (extensible content types)

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

### Fallback chain (guest portal render)

  1. Tenant translation for requested locale
  2. Platform default for requested locale (PLATFORM namespace only)
  3. Tenant translation for primary locale
  4. Platform default for primary locale
  5. Raw sourceValue from TenantConfig (always exists, never undefined)

All translations loaded in ONE findMany query — never N+1.

### Database models

  TenantLocale — locale, published, primary per tenant
    @@unique([tenantId, locale])
    @@index([tenantId, published])

  TenantTranslation — resourceId, value, sourceDigest per locale per tenant
    @@unique([tenantId, locale, resourceId])
    @@index([tenantId, locale])
    @@index([tenantId, resourceId])

  TranslationNamespace enum — PLATFORM, TENANT, LOCKED

### Key files

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

### API routes

- `GET  /api/translations/locales` — list tenant locales
- `POST /api/translations/locales` — add locale (idempotent)
- `PATCH /api/translations/locales/[locale]` — publish/unpublish
- `DELETE /api/translations/locales/[locale]` — atomic delete locale + translations
- `GET  /api/translations/[locale]` — scan + load translation panel data
- `PUT  /api/translations/[locale]` — bulk save with digest conflict detection (409)
- `POST /api/translations/[locale]/cleanup` — orphan cleanup (synchronous)
- `GET  /api/translations/locales/published` — internal route for middleware

### Middleware locale handling

URL pattern: /p/[token]/[locale]/... → rewrite to /p/[token]/...
Locale detected via regex, validated against published state via internal
API route (middleware runs in Edge runtime, cannot import prisma).
locale-cache.ts is Edge-safe (pure in-memory, no DB imports).
Cache invalidated on PATCH/DELETE via invalidateLocaleCache().

### Live mirroring (editor → translation panel)

configChannel — module-level pub/sub, no React, bridges PreviewContext tree
and SettingsPanel tree (which are separate React trees).

PreviewContext emits configChannel.emit(config) on every config change.
TranslationPanel subscribes with stable useEffect([locale]) — uses dataRef
to avoid infinite re-subscription. Debounces 300ms. editingFieldsRef
protects unsaved user edits from being overwritten during mirror updates.

### Race safety mechanisms

1. Optimistic locking on publish (settingsVersion)
2. Digest conflict on translation save (409 Conflict with new source)
3. Bulk save atomicity (deleteMany + createMany in $transaction)
4. Atomic locale deletion ($transaction)
5. Published cache invalidation (10s TTL + explicit invalidate)
6. Stable channel subscription (dataRef, not data in deps)
7. Editing field protection (editingFieldsRef + isEditingRef per field)

### Orphan cleanup

Triggered after every publishDraft(). Scans published config, collects
current resourceIds, deletes translations with orphaned resourceIds.
Runs synchronously — cleanup is a simple deleteMany, fast enough to
not block the publish response. Failure is caught and logged, never
blocks publish success.

### Translation invariants — never violate these

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

---

## Domain & subdomain infrastructure

Shopify pattern: every tenant gets a unique subdomain automatically.

### URL structure

  Admin app:       bedfront.com (Vercel, Clerk auth)
  Tenant portal:   {portalSlug}.bedfront.com (wildcard DNS)
  Portal page:     {portalSlug}.bedfront.com/home/{portalToken}

  Example:
    Admin:   bedfront.com/design
    Portal:  apelviken-dev-3vtczx.bedfront.com
    Booking: apelviken-dev-3vtczx.bedfront.com/home/tok_abc123

### DNS & hosting

  *.bedfront.com wildcard DNS on Vercel — automatic SSL for all subdomains.
  Database: PostgreSQL on Render (external connection from Vercel).
  No per-tenant DNS configuration needed.

### portalSlug

Every Tenant has a unique `portalSlug` field — the subdomain identifier.
Format: `{name-base}-{random6}` (e.g. "grand-hotel-stockholm-x4k9mq").

  - Generated once on tenant creation (Clerk org.created webhook)
  - Immutable — never changes after creation
  - URL-safe: lowercase, no special chars, Swedish chars normalized (å→a, ö→o)
  - Collision-safe: 6-char nanoid suffix + DB unique constraint + 5 retries
  - Stored on Tenant model: `portalSlug String? @unique`
  - Nullable for backfill — all existing tenants backfilled via one-time endpoint

### portalToken

Every Booking has a unique `portalToken` field — the URL identifier for
guest portal access. Different from the booking-scoped MagicLink model.

  - Generated on booking creation in upsertSyncedBooking()
  - Immutable — a booking's portal URL never changes
  - Lazy backfill: existing bookings get a token on next sync
  - Format: 24 random bytes → 32-char base64url string
  - Stored on Booking model: `portalToken String? @unique`

### Key files

- Slug generation: `app/_lib/tenant/portal-slug.ts`
- Portal token: `app/_lib/integrations/sync/portal-token.ts`
- Booking resolution: `app/(guest)/_lib/portal/resolveBooking.ts`
- Clerk webhook: `app/api/webhooks/clerk/route.ts`
- Backfill endpoints: `app/api/admin/backfill-portal-slugs/route.ts`,
  `app/api/admin/backfill-email-from/route.ts`

### Helper functions (portal-slug.ts)

  nameToSlugBase(name)           — "Grand Hotel" → "grand-hotel"
  generatePortalSlug(name)       — "grand-hotel-x4k9mq" (async, checks DB)
  portalSlugToUrl(slug)          — "https://{slug}.bedfront.com"
  tenantDefaultEmailFrom(slug)   — "noreply@{slug}.bedfront.com"
  tenantFromAddress(name, slug, customFrom?, customFromName?)
                                 — "Grand Hotel <noreply@{slug}.bedfront.com>"

---

## Email notification system

Shopify-grade transactional email via Resend. Per-tenant sender
identity, template customization, rate limiting, and delivery tracking.

### Architecture overview

  sendEmailEvent() is the ONLY entry point for all outgoing email.
  Nothing else in the codebase calls resendClient directly.

  Flow:
    1. Check unsubscribe — skip silently if opted out
    2. Check rate limit — skip silently if exceeded
    3. Create send log (QUEUED)
    4. Resolve template (tenant override → platform default)
    5. Render variables + inject preview text
    6. Send via Resend with List-Unsubscribe headers
    7. Update log (SENT/FAILED)
    8. Record send for rate limiting

### Sender identity

Every tenant gets an automatic email address based on their subdomain:
  noreply@{portalSlug}.bedfront.com

  Priority chain for from-address:
    1. Custom emailFrom (tenant verified their own domain)
    2. portalSlug-based: noreply@{slug}.bedfront.com
    3. Fallback: noreply@bedfront.com (no portalSlug — edge case)

  Set atomically on tenant creation (Clerk webhook).
  Displayed read-only in admin settings (Portaladress + E-post).

### Event types (6)

  BOOKING_CONFIRMED    — after booking synced with PRE_CHECKIN status
  BOOKING_CANCELLED    — after booking status → CANCELLED
  CHECK_IN_CONFIRMED   — after check-in (sync or guest portal action)
  CHECK_OUT_CONFIRMED  — after check-out (sync or guest portal action)
  MAGIC_LINK           — guest requests portal login link
  SUPPORT_REPLY        — hotel replies to support ticket

  Registry: `app/_lib/email/registry.ts` — single source of truth.

### Email triggers (sync lifecycle)

  email-triggers.ts maps sync events → sendEmailEvent() calls.
  Isolated from sync engine — email concerns never leak into sync.

  Dedup: Booking has confirmedEmailSentAt, checkedInEmailSentAt,
  checkedOutEmailSentAt timestamps. Checked before sending.
  No dedup for CANCELLED — can be cancelled, re-confirmed, cancelled again.

  safeSend() wraps every trigger — email failures NEVER abort sync.

### Rate limiting

  Per-recipient, per-event-type, rolling time window.
  Append-only EmailRateLimit table — count rows, no update races.

  Limits:
    MAGIC_LINK:          3 per 15 min
    BOOKING_CONFIRMED:   1 per 24h
    BOOKING_CANCELLED:   2 per 24h
    CHECK_IN_CONFIRMED:  1 per 24h
    CHECK_OUT_CONFIRMED: 1 per 24h
    SUPPORT_REPLY:       20 per 24h

  Fail-open: if rate limit check fails (DB error), allow the send.
  Cleanup: daily cron deletes records > 24h.

### Template system

  React Email components render default HTML (Swedish).
  Tenants can override subject, preview text, and HTML per event type.
  Variable substitution: {{guestName}}, {{hotelName}}, etc.
  Live preview in admin settings with debounced iframe.

### Unsubscribe

  HMAC-SHA256 tokens (deterministic, timing-safe).
  One-click unsubscribe via List-Unsubscribe header.
  Public /unsubscribe page — no auth required.
  Auto-unsubscribe on bounce/complaint via Resend webhook.

### Domain verification

  Tenants can optionally verify their own domain (e.g. grandhotel.se)
  to send from a custom address instead of the automatic one.
  Managed via Resend Domains API. DNS records shown in admin UI.

### Magic link authentication

  Email-based guest portal login — no passwords.
  Flow: guest enters email → system generates signed token → sends email
  → guest clicks link → token validated → session cookie set → redirect.

  MagicLinkToken model: tenanskap t+email scoped (not booking-scoped).
  Rate limited: 3 per 15 min per email+tenant.
  Token: 32 random bytes, base64url, 24h expiry, single-use.
  Session: iron-session encrypted cookie, 7-day maxAge.

### Database models

  EmailTemplate      — per-tenant template overrides (subject, preview, HTML)
  EmailSendLog       — append-only audit trail (QUEUED → SENT → DELIVERED/BOUNCED)
  EmailUnsubscribe   — per-tenant opt-out registry
  EmailDomain        — sender domain verification (Resend)
  EmailRateLimit     — append-only send log for rate limiting
  MagicLinkToken     — email-based auth tokens (tenant+email scoped)

### Key files

- Send layer: `app/_lib/email/send.ts`
- Registry: `app/_lib/email/registry.ts`
- Rate limit: `app/_lib/email/rate-limit.ts`
- Templates: `app/_lib/email/templates/`
- Unsubscribe: `app/_lib/email/unsubscribe-token.ts`
- Email triggers: `app/_lib/integrations/sync/email-triggers.ts`
- Magic link: `app/_lib/magic-link/`
- Guest session: `app/_lib/magic-link/session.ts`
- Admin UI: `app/(admin)/settings/email/`
- Resend webhook: `app/api/webhooks/resend/route.ts`

### Email invariants — never violate these

1. sendEmailEvent() is the ONLY way to send email
2. Email failures NEVER abort sync or throw to callers
3. safeSend() wraps all trigger calls — log and swallow errors
4. Rate limiting is fail-open — availability over perfect limiting
5. Unsubscribe check is always first, before any template work
6. portalUrl in emails uses tenant subdomain, not NEXT_PUBLIC_APP_URL
7. emailFrom is set atomically on tenant creation — never null in steady state
8. One-click unsubscribe headers on every outgoing email
9. Template variables are rendered with {{var}} — unknown vars kept as-is
10. Dedup timestamps on Booking prevent duplicate notification emails
