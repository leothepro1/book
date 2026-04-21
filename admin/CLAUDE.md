# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## THE BAR — read this first, every time

This platform is built to **Shopify engineering-team standards**. Not "inspired
by Shopify". Not "similar to Shopify". Every architectural decision, every
database schema, every API surface, every infrastructure choice must be
defensible to a senior Shopify engineer in a design review.

The operative test:

> **"Would the Shopify Platform team merge this PR?"**

If the answer is anything other than a confident yes, it is not done.

### The scale target is non-negotiable

The architecture must handle:

- **10,000 active tenants** on the platform simultaneously
- **10,000 concurrent guests per tenant per hour** at peak
- **~27,000 requests/second sustained** across the fleet
- **Zero cross-tenant data leakage** under any failure mode
- **Zero downtime** for schema migrations, deploys, and adapter swaps
- **Sub-200ms p95** for storefront reads, sub-500ms p95 for checkout

Every change is evaluated against this target. "Works for one tenant today"
is not a passing grade. "Works under load, across regions, with one service
degraded" is.

### Non-negotiable architectural qualities

1. **Stability** — failure in one tenant never affects another; one service
   degradation never brings down the platform
2. **Robustness** — every external call has timeouts, retries, circuit
   breakers, and fallbacks; every mutation is idempotent
3. **Scalability** — horizontal by design; no in-memory state, no
   single-instance bottlenecks, no N+1 queries
4. **Observability** — every request is traceable end-to-end; every error
   lands in Sentry with tenant + request context; every SLO is measurable
5. **Security** — tenant isolation by design, defense in depth, least
   privilege, secrets never in code or logs
6. **Reversibility** — every migration has a rollback; every feature has a
   flag; every deploy can be reverted in <60 seconds

### What this means in practice

- No solution is "good enough for now" if it cannot scale 100×
- No schema change lands without a migration plan reviewed for zero-downtime
- No new external service integrates without timeouts, retries, and fallback
- No tenant-specific code path exists anywhere — architecture scales by design
- No dependency is added without a cost/risk assessment at 10k tenants
- No feature ships without tenant-isolation tests, load-tested critical paths,
  and structured logging on every state transition
- No shortcut, no technical debt, no "temporary" solution

If a Claude Code change violates any of the above, **flag it to the user
explicitly** rather than merging.

---

## What this project is

**Shopify for bookings.** A hospitality commerce platform where hotels,
resorts, and campgrounds build and run their entire booking engine.
Tenants get a white-label storefront on their own subdomain with a
visual editor, product catalog, availability search, checkout, and
order management — exactly like Shopify, but purpose-built for
hospitality bookings.

This is NOT a guest service portal. This IS a commerce platform.
The mental model is always Shopify:

  Shopify products     → Accommodation categories (room types, cabins, camping)
  Shopify collections  → Product groups (summer packages, weekend deals)
  Shopify orders       → Bookings (reservations with guests, dates, payments)
  Shopify themes       → Booking engine themes (visual editor, section builder)
  Shopify analytics    → Booking analytics (revenue, occupancy, conversion)
  Shopify checkout     → Booking flow (search → select → pay → confirm)

The platform is intentionally controlled. Tenants cannot create arbitrary
pages or layouts. Everything is platform-defined and architecturally constrained.

### What we are building (roadmap context)

- Visual editor with section builder (DONE — Shopify-grade)
- White-label multi-tenant with subdomains (DONE)
- Desktop/mobile responsive preview (DONE)
- PMS integration for real-time availability + rates (adapter pattern DONE, Mews TODO)
- Search container with morphing panels — locked section (DONE)
- Layout settings (max-width, desktop padding) (DONE)
- Product catalog with collections (DONE — full CRUD, variants, inventory, pricing)
- Product templates (category detail pages)
- Theme templates (full-page theme presets)
- Stripe Connect + checkout + orders (DONE — unified architecture)
- Cart system with server-side validation (DONE)
- Order management with admin UI (DONE)
- Email notifications: booking confirmed, order confirmed (DONE)
- Analytics dashboard (revenue, occupancy, conversion rates)
- Mews PMS adapter (infrastructure ready, API integration TODO)

Every feature ships at Shopify quality or not at all.

---

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind / CSS modules — BEM-style class naming
- Prisma + PostgreSQL (Render) — NEVER reset or delete production data
- Clerk for auth (skipped in dev via devAuth.ts)
- Cloudinary for media
- Resend for transactional email
- Material Symbols Rounded for icons
- Deployed on Vercel (rutgr.com, *.rutgr.com wildcard)

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

1. Admin editor — tenants design the booking engine
2. Booking engine — what visitors see (publicly accessible, no auth required)
3. Platform backend

Editor and booking engine share configuration models.

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

Canvas: live booking engine preview
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
- `/api/email-templates` — template CRUD + preview + test send
- `/api/admin/backfill-portal-slugs` — one-time slug backfill (CRON_SECRET)
- `/api/admin/backfill-email-from` — one-time emailFrom backfill (CRON_SECRET)

---

## PMS integration layer

Aggregator pattern — normalizes data from multiple hotel systems (Mews,
Apaleo, Opera) into a canonical format. Hotels connect once, platform
queries real-time availability, rates, and restrictions everywhere.

**Architecture: real-time queries, not background sync.**
The booking engine queries PMS on demand (availability search, rate lookup,
booking creation). There is no background sync loop — data is always fresh.

### Adapter contract (8 capabilities)

Every PMS implements PmsAdapter interface:

  1. getAvailability(params)       — rooms/units per date with rate plans
  2. getRoomTypes(tenantId)        — categories, capacity, images, facilities
  3. getRestrictions(from, to)     — min/max stay, CTA/CTD per date
  4. lookupBooking(reference)      — existing booking by confirmation number
  5. getGuest(bookingExternalId)   — guest data linked to a booking
  6. getAddons(categoryId?)        — extras (breakfast, parking, cleaning)
  7. getPaymentStatus(bookingId)   — paid/unpaid/outstanding balance
  8. testConnection(credentials)   — validate PMS credentials

Plus webhook infrastructure: resolveWebhookTenant(), verifyWebhookSignature()

`resolveAdapter(tenantId)` is the ONLY entry point for platform code.
Never call PMS APIs directly. Registry maps provider → adapter instance.

Implemented: Mews (stubbed — infrastructure ready), Fake (full dev data), Manual (no PMS)
Planned: Apaleo, Opera

### Normalized types (types.ts)

  RoomCategory      — accommodation type (id, name, description, images, capacity, base price)
  RatePlan          — pricing option (flexible/non-refundable, price per night, total, addons)
  AvailabilityResult — search result (categories with rate plans, units, search params)
  Restriction       — stay constraints (min/max nights, CTA/CTD per date)
  BookingLookup     — existing booking (guest, dates, status, amount, rate plan)
  GuestData         — guest info (name, email, phone, address)
  Addon             — extra service (name, price, pricing mode)
  PaymentStatus     — payment state (total, paid, outstanding, status)

All types have Zod schemas for runtime validation.

### Credentials & encryption

AES-256-GCM encryption (crypto.ts). 12-byte IV, 16-byte auth tag.
Key: INTEGRATION_ENCRYPTION_KEY env var (min 32 chars).
Credentials never logged, never returned to client in cleartext.
Sensitive fields masked as "••••••••••••••••" in UI.

### Resilience layers

1. Rate limiting — DB-backed token bucket (200 req/30s per accessToken)
2. Circuit breaker — consecutiveFailures on TenantIntegration (opens after 5)
3. Webhook dedup — WebhookDedup table with unique dedupKey (7d retention)
4. Webhook signature verification — provider-specific (Mews: URL token)
5. Audit logging — SyncEvent append-only log for all PMS interactions

### Data models

  TenantIntegration — 1:1 with Tenant. Provider, encrypted creds, status, circuit breaker
  SyncEvent — append-only audit log (webhook events, connection tests)
  RateLimit — token bucket per accessToken (DB-backed)
  WebhookDedup — dedup key per webhook event (7d retention)

### Key files

- Normalized types: `app/_lib/integrations/types.ts`
- Adapter interface: `app/_lib/integrations/adapter.ts`
- Registry: `app/_lib/integrations/registry.ts`
- Resolution: `app/_lib/integrations/resolve.ts`
- Mews adapter: `app/_lib/integrations/adapters/mews/`
- Fake adapter: `app/_lib/integrations/adapters/fake/`
- Circuit breaker: `app/_lib/integrations/sync/circuit-breaker.ts`
- Encryption: `app/_lib/integrations/crypto.ts`

### Integration invariants — never violate these

1. resolveAdapter(tenantId) is the ONLY way to get an adapter
2. All PMS data normalized to canonical types (RoomCategory, RatePlan, etc.)
3. Credentials encrypted at rest, decrypted only at call time
4. Real-time queries — no background sync, data is always fresh from PMS
5. Circuit breaker uses consecutive failures (opens after 5)
6. Webhook dedup via DB unique constraint
7. Fake adapter throws in production — dev/test only
8. Every adapter method returns normalized data — never raw PMS responses

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

## Migrations workflow — non-negotiable rules

Ratified 2026-04-21 after migration history squash. These rules exist
because migration drift is how production systems silently become
un-deployable. See `prisma/migrations-archive-2026-04-21/README.md` for
the incident that triggered these rules.

1. NEVER run `prisma db push` against any DB shared with another
   environment or developer. `db push` bypasses the migration system
   and causes drift.

2. ALL schema changes MUST go through
   `prisma migrate dev --name descriptive_name` locally. This creates
   a migration file that is committed to git.

3. NEVER delete files from `prisma/migrations/`. If a migration needs
   reversal, create a new migration that reverses it.

4. NEVER manually edit applied `migration.sql` files. If wrong, create
   a corrective new migration.

5. When cloning a fresh dev environment, `prisma migrate deploy`
   against a blank DB MUST build the entire schema. If it doesn't,
   the history is broken — escalate, do not paper over it.

6. Before any PR touching schema.prisma, verify
   `prisma migrate status` reports "up to date" against your local
   dev DB.

7. Baseline squashes (merging history into a single file) are
   ALLOWED but RARE — only done deliberately with documented
   procedure and full backup. See
   `prisma/migrations-archive-*` for historical baselines.

8. When adding a new table or model: schema.prisma FIRST, then
   `prisma migrate dev`, then code that uses it. Never the other
   way around.

### Partial/filtered indexes

Prisma DSL cannot express partial unique indexes (e.g. `WHERE column
IS NOT NULL`). When such an invariant is needed at the DB level, the
convention is:

1. Add a comment block in schema.prisma on the model documenting the
   intended constraint and why Prisma can't express it (see
   `SpotMarker` for a reference).
2. Add the raw SQL at the end of the migration file under a
   clearly-marked section:
   `-- Partial unique indexes (not expressible in Prisma DSL)`
3. The app code that relies on the constraint must catch the specific
   unique-constraint error and translate it into a meaningful
   user-facing error (see `app/api/apps/spot-booking/markers/route.ts`
   for the reference pattern).

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

## Component reuse — ZERO TOLERANCE for recreation

**If a component exists, use it. Do not build a new version.**

This is the single most important rule in the codebase. Before writing
ANY UI element, search the codebase for existing implementations.
"Inspired by" or "similar to" is not acceptable — use the EXACT component.

### Mandatory reuse checklist — check EVERY time

Before building any of these, STOP and find the existing implementation:

**Color picker:**
  Editor uses `sf-color-row` + `sf-color-swatch` + `sf-input--color-hex`
  (defined in base.css, used in app/(editor)/editor/fields/FieldColor.tsx)
  NEVER create a custom color picker. NEVER use design-color-* classes
  outside of /design.

**Image upload / media picker:**
  Editor uses `MediaLibraryModal` + `img-upload` pattern
  (app/(admin)/_components/MediaLibrary + app/(editor)/editor/fields/FieldImage.tsx)
  Shows "Ladda upp bild" → opens MediaLibrary modal → returns asset URL.
  NEVER use raw <input type="file"> or custom upload widgets.

**Modals:**
  Admin uses `.am-overlay` + `.am-modal` (slide up, instant close)
  Guest uses `.com__overlay` + `.com__modal` (same animation)
  Editor uses `.settings-panel` for side panels
  NEVER create new modal CSS — use existing patterns.

**Toggles:** `.admin-toggle` + `.admin-toggle-on` + `.admin-toggle-thumb`
**Buttons:** `.admin-btn`, `.settings-btn--connect`, `.settings-btn--outline`, etc.
**Inputs:** `.sf-input`, `.email-sender__input`, `.admin-input--sm`
**Dropdowns:** `.admin-dropdown` family
**Labels:** `.admin-label`, `.design-field-label`, `.gc-modal-field__label`
**Loading:** `<Loading />` and `<LoadingScreen />` from app/_components/Loading

### The rule

When the user says "same as X" or "like in /editor" or "use our existing":
1. FIND the exact component file
2. READ it completely
3. IMPORT and USE it directly — or copy the exact JSX + class names
4. Do NOT approximate, simplify, or "improve" it

Violation of this rule wastes time and breaks visual consistency.

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

This IS Shopify for bookings. Not "inspired by" or "similar to" — it IS
the same caliber of platform. Products, categories, orders, analytics,
themes, checkout, multi-tenant infrastructure, visual editor, section
builder, PMS integrations, email notifications, payment processing.
The quality, architecture, and attention to edge cases must match Shopify
from the start. There is never a valid reason to cut corners, skip edge
cases, or ship something that would not pass enterprise review. Every
feature ships complete or not at all. No temporary solutions.

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

### Fallback chain (booking engine render)

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

## Product catalog — complete data model

Shopify-grade product infrastructure. Full CRUD with variants, options,
inventory tracking, price history, collections, and tags. All operations
are tenant-scoped and admin-gated.

### Product model

Product is the core catalog entity. Fields:

  title, slug (auto-generated, unique per tenant, Swedish-normalized)
  description (max 10000), status (ACTIVE/DRAFT/ARCHIVED)
  price (base, in smallest currency unit — ören for SEK, e.g. 12900 = 129 kr)
  currency (default "SEK"), compareAtPrice (strikethrough price, must be > price)
  taxable (boolean), trackInventory, inventoryQuantity, continueSellingWhenOutOfStock
  version (optimistic locking — every update increments, rejects stale writes)
  sortOrder, archivedAt (soft delete timestamp)

### Product media

ProductMedia — images and videos attached to a product.
Fields: url, type (image|video), alt, filename, width, height, sortOrder.
DnD reordering via MediaLibrary component.

### Options and variants (Shopify model)

ProductOption — axis of variation (e.g. "Tid", "Storlek", "Typ").
  name + values (JSON array). Max 3 options per product, max 100 values each.

ProductVariant — specific combination of option values.
  option1/option2/option3 (positional, nullable), imageUrl, price (override),
  compareAtPrice, sku, trackInventory, inventoryQuantity,
  continueSellingWhenOutOfStock, version, sortOrder.

**Price resolution:** variant.price > 0 → use variant price, else inherit product.price.
`effectivePrice(productPrice, variantPrice)` is the ONLY entry point.
`formatPriceDisplay()` handles currency formatting (12900 → "129" for SEK).

### Collections (produktserier)

ProductCollection — groups of products with many-to-many relationship.
Fields: title, slug, description, imageUrl, status (ACTIVE/DRAFT), version, sortOrder.

ProductCollectionItem — join table with sortOrder per membership.
A product can belong to multiple collections. Each membership has independent sort order.
DnD reordering in admin UI.

### Tags

ProductTag — global tag registry per tenant (normalized lowercase).
ProductTagItem — many-to-many join. Tags are searchable, filterable.

### Inventory system

Optional per product OR per variant (when variants exist).

**Append-only ledger:** InventoryChange tracks every quantity change.
  quantityDelta (signed), quantityAfter (denormalized), reason, note, actorUserId.

  Reasons: PURCHASE, MANUAL_ADJUSTMENT, RETURN, RESERVATION,
           RESERVATION_RELEASED, INITIAL.

Reservation flow: reserve() → purchase (consume stock) or expire (release stock).
continueSellingWhenOutOfStock allows overselling when stock = 0.

### Price audit trail

**Append-only ledger:** PriceChange tracks every price modification.
  previousPrice, newPrice, currency, actorUserId, createdAt.

### Enterprise features

1. **Optimistic locking** — Product.version, Collection.version, Variant.version.
   updateProduct rejects with code "VERSION_CONFLICT" if expectedVersion mismatches.
2. **Slug uniqueness** — [tenantId, slug] constraint. Auto-generated from title
   with Swedish normalization (å→a, ä→a, ö→o). Collision resolution with suffix.
3. **Soft delete** — ARCHIVED status + archivedAt. Hidden from storefront, data preserved.
   restoreProduct() to unarchive.
4. **Variant validation** — every variant must have values for all options. No duplicates.

### Guest-facing product rendering (current state)

Products displayed via section renderers — NOT individual product pages:
  CollectionGridRenderer — 2-column CSS grid, configurable aspect ratio
  ProductHeroRenderer — full-width image + heading + text + buttons
  ProductHeroSplitRenderer — split layout
  CollectionGridV2Renderer — newer variant

**Currently display-only.** No variant selection UI, no "add to cart" button.
Products are manually curated into sections by admins via the visual editor.

### Key files

- Types + validation: `app/_lib/products/types.ts`
- Server actions: `app/_lib/products/actions.ts`
- Inventory logic: `app/_lib/products/inventory.ts`
- Pricing logic: `app/_lib/products/pricing.ts`
- Admin UI: `app/(admin)/products/`, `app/(admin)/collections/`
- Guest renderers: `app/(guest)/_components/sections/renderers/`

---

## Commerce engine — checkout, orders, payments

Unified checkout architecture. One Order lifecycle, one webhook handler,
one state machine — regardless of payment method.

### Core principle: Order-first

An Order is ALWAYS created before any Stripe API call. The Order is the
source of truth. Stripe is an implementation detail under the Order.
Product type (accommodation vs standard) affects fulfillment logic — not
checkout architecture.

### Two checkout flows, one Order model

Both flows create an Order FIRST, then create the Stripe object:

**1. Checkout Session flow (cart/shop)**
  URL: /shop → /shop/checkout/success
  API: POST /api/checkout/create
  Creates: Order + Stripe Checkout Session (hosted by Stripe)
  Used for: STANDARD products via cart (add-to-cart → cart → pay)
  Payment: Redirect to Stripe-hosted page
  Webhook: checkout.session.completed → PENDING→PAID

**2. Elements flow (accommodation)**
  URL: /checkout → /checkout/success
  API: POST /api/checkout/payment-intent
  Creates: Order + Stripe PaymentIntent (clientSecret for Elements)
  Used for: PMS_ACCOMMODATION products (search → select → pay)
  Payment: Embedded Stripe Elements in page
  Webhook: payment_intent.succeeded → PENDING→PAID
  Guest info: Collected in step 3, saved via POST /api/checkout/update-guest

### Order state machine

```
PENDING → PAID → FULFILLED
    ↓        ↓
CANCELLED  CANCELLED → (requires refund)
              ↓
           REFUNDED
```

`canTransition(from, to)` in `_lib/orders/types.ts` is the ONLY guard.
It is called before EVERY status mutation — in webhook handlers and
admin actions. Never write `order.status !== "PENDING"` inline.

### Data models

**Order** — every purchase, regardless of type
  id, tenantId, orderNumber (sequential #1001+), status, paymentMethod
  (STRIPE_CHECKOUT | STRIPE_ELEMENTS), guestEmail, guestName, guestPhone
  subtotalAmount, taxRate (basis points), taxAmount, totalAmount, currency
  stripeCheckoutSessionId, stripePaymentIntentId, metadata (JSON)
  Timestamps: paidAt, fulfilledAt, cancelledAt, refundedAt

**OrderLineItem** — snapshot frozen at purchase time
  title, variantTitle, sku, imageUrl — NEVER join back to Product

**OrderEvent** — append-only audit log (Shopify timeline)
  Types: CREATED, PAID, FULFILLED, CANCELLED, REFUNDED, NOTE_ADDED,
         EMAIL_SENT, INVENTORY_RESERVED/CONSUMED/RELEASED,
         STRIPE_WEBHOOK_RECEIVED, PAYMENT_FAILED, GUEST_INFO_UPDATED,
         RECONCILED

**OrderNumberSequence** — atomic per-tenant counter via raw SQL
  INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING (race-safe)

**StripeWebhookEvent** — event-level dedup (stripeEventId PK)
  Cleaned up after 30 days by cron.

### Stripe Connect

Each tenant connects their own Stripe account (Standard Connect).
Key fields on Tenant: stripeAccountId, stripeOnboardingComplete,
stripeLivemode, stripeConnectedAt.

- `getStripe()` in `_lib/stripe/client.ts` — singleton, ONLY entry point
- `_lib/stripe/connect.ts` — onboarding, status check, disconnect
- `_lib/stripe/verify-account.ts` — cached charges_enabled check (60s TTL)
- Connect params: `{ stripeAccount: tenant.stripeAccountId }` on all Stripe calls

### Webhook handler (api/webhooks/stripe/route.ts)

Handles all Stripe events in one handler:
  checkout.session.completed — Checkout Session paid
  checkout.session.expired — session timed out
  payment_intent.succeeded — Elements payment confirmed
  payment_intent.payment_failed — Elements payment failed (logged, not cancelled)
  charge.refunded — refund processed

Security layers:
1. Signature verification (stripe.webhooks.constructEvent, default 300s tolerance)
2. Connect account verification (event.account → prisma lookup before trusting metadata)
3. Event-level dedup (StripeWebhookEvent unique INSERT)
4. Order-level idempotency (canTransition guard)

### Reconciliation (api/cron/reconcile-stripe/route.ts)

Runs every 15 minutes. Finds PENDING orders older than 30 minutes,
checks actual status on Stripe, heals missed webhooks.
Covers: PI succeeded but webhook missed, session expired but webhook missed.

### Cart system

Client-side localStorage, server-validated at checkout.
Key: `bf_cart_{tenantId}`. NOT a DB model.
`validateCart()` re-computes prices via `effectivePrice()` — never trusts client.

### Security hardening

- tenantId NEVER in request bodies — resolved from host header via
  `resolveTenantFromHost()` in all checkout/booking API routes
- Amount NEVER from client — derived server-side from product/PMS
- Amount bounds: min 1000 (10 SEK), max 10,000,000 (100K SEK)
- Currency allowlist: SEK, EUR, NOK, DKK — z.enum(), not z.string()
- Date validation: `validateStayDates()` in `_lib/validation/dates.ts`
  (shared across all routes — min 1 night, max 365, not in past)
- Rate limiting: in-memory sliding window per IP (X-Forwarded-For first IP)
  PI: 10/hr, checkout-create: 10/hr, bookings: 20/hr, update-guest: 5/10min
- Connect: `verifyChargesEnabled()` with 60s cache before every Stripe call
- PMS booking idempotency: `PendingBookingLock` table (SHA-256 of
  tenant+category+dates+email), 60s TTL, cleaned by cron

### Tax

`getTaxRate()` in `_lib/orders/tax.ts` returns 0 (stub).
Both checkout routes call it. Order stores `taxRate` (basis points)
and `taxAmount`. UI shows "inkl. moms" until tax engine is implemented.

### Key files

- Checkout page: `app/(guest)/checkout/page.tsx` + `CheckoutClient.tsx`
- Success page: `app/(guest)/checkout/success/page.tsx`
- Payment intent: `app/api/checkout/payment-intent/route.ts`
- Checkout create: `app/api/checkout/create/route.ts`
- Guest info: `app/api/checkout/update-guest/route.ts`
- Webhook: `app/api/webhooks/stripe/route.ts`
- Reconciliation: `app/api/cron/reconcile-stripe/route.ts`
- Expire reservations: `app/api/cron/expire-reservations/route.ts`
- Stripe client: `app/_lib/stripe/client.ts`
- Stripe Connect: `app/_lib/stripe/connect.ts`
- Account verify: `app/_lib/stripe/verify-account.ts`
- Order types: `app/_lib/orders/types.ts`
- Order sequence: `app/_lib/orders/sequence.ts`
- Tax stub: `app/_lib/orders/tax.ts`
- Cart client: `app/_lib/cart/client.ts`
- Cart validate: `app/_lib/cart/validate.ts`
- Date validation: `app/_lib/validation/dates.ts`
- Rate limiting: `app/_lib/rate-limit/checkout.ts`
- Logger: `app/_lib/logger.ts`
- Booking create: `app/api/bookings/create/route.ts`
- Availability: `app/api/availability/route.ts`
- Admin orders: `app/(admin)/orders/`
- Payments settings: `app/(admin)/settings/payments/`

### Cron jobs (vercel.json)

- `/api/cron/expire-reservations` — every 5 min
  Releases expired inventory reservations, booking locks, webhook events (>30d)
- `/api/cron/reconcile-stripe` — every 15 min
  Heals stuck PENDING orders by checking Stripe status

### Commerce invariants — never violate these

1. Order is created BEFORE any Stripe API call — always
2. canTransition() is the ONLY guard for status mutations — no inline checks
3. tenantId is NEVER in a request body — resolved from host header
4. Payment amount is NEVER from the client — derived server-side
5. Product prices in smallest currency unit (ören/cents) — never floats
6. effectivePrice() is the ONLY price resolution function
7. Order line items snapshot all product data at purchase time
8. Inventory changes are append-only — never UPDATE, always INSERT
9. Stripe webhooks are idempotent — event dedup + canTransition guard
10. Cart validated server-side before checkout — never trust client prices
11. Order numbers are sequential per tenant — atomic DB counter
12. All Stripe calls use Connect params when tenant has stripeAccountId
13. No Stripe secret keys in client code — only NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
14. Reservation TTL enforced — cron releases expired reservations
15. Structured logging (JSON) on all payment lifecycle events

---

## Domain & subdomain infrastructure

Shopify pattern: every tenant gets a unique subdomain automatically.

### URL structure

  Admin app:       rutgr.com (Vercel, Clerk auth)
  Booking engine:  {portalSlug}.rutgr.com (wildcard DNS)
  Booking page:    {portalSlug}.rutgr.com/home/{portalToken}

  Example:
    Admin:   rutgr.com/design
    Portal:  apelviken-dev-3vtczx.rutgr.com
    Booking: apelviken-dev-3vtczx.rutgr.com/home/tok_abc123

### DNS & hosting

  *.rutgr.com wildcard DNS on Vercel — automatic SSL for all subdomains.
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
booking engine access. Different from the booking-scoped MagicLink model.

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
  portalSlugToUrl(slug)          — "https://{slug}.rutgr.com"
  tenantDefaultEmailFrom(slug)   — "noreply@{slug}.rutgr.com"
  tenantFromAddress(name, slug, customFrom?, customFromName?)
                                 — "Grand Hotel <noreply@{slug}.rutgr.com>"

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
  noreply@{portalSlug}.rutgr.com

  Priority chain for from-address:
    1. Custom emailFrom (tenant verified their own domain)
    2. portalSlug-based: noreply@{slug}.rutgr.com
    3. Fallback: noreply@rutgr.com (no portalSlug — edge case)

  Set atomically on tenant creation (Clerk webhook).
  Displayed read-only in admin settings (Portaladress + E-post).

### Event types (6)

  BOOKING_CONFIRMED    — after booking synced with PRE_CHECKIN status
  BOOKING_CANCELLED    — after booking status → CANCELLED
  CHECK_IN_CONFIRMED   — after check-in (sync or booking engine action)
  CHECK_OUT_CONFIRMED  — after check-out (sync or booking engine action)
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

  Email-based booking engine login — no passwords.
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

---

## Enterprise infrastructure

This platform is built to Shopify-level enterprise standards. Every architectural
decision is made against one question: "Would Shopify approve this?" Not "does it
work?" — but "would Shopify's SRE team approve this pattern?"

The following infrastructure layers are non-negotiable. Every new feature must
integrate with them correctly or not ship.

---

### Observability — Sentry

Sentry is wired up for full production error tracking.

Key files:
- sentry.client.config.ts
- sentry.server.config.ts
- sentry.edge.config.ts
- instrumentation.ts
- app/_lib/observability/sentry.ts — setSentryTenantContext()

**Rule: tenantId context on every request.**
Both tenant resolution functions call setSentryTenantContext() immediately
after resolving tenantId. This means every error in Sentry is tagged with
the tenant that caused it.

  app/(admin)/_lib/tenant/getCurrentTenant.ts — calls setSentryTenantContext() after line 26
  app/(guest)/_lib/tenant/resolveTenantFromHost.ts — calls it in both dev and prod branches

Never add Sentry.captureException() without first ensuring tenantId is in context.
Never remove or bypass setSentryTenantContext() calls.

Required env vars: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN (same value)

---

### Database — connection pool + slow query detection

app/_lib/db/prisma.ts is the ONLY place PrismaClient is instantiated.

Configuration applied:
- transactionOptions: timeout 30s, maxWait 5s
- getDatabaseUrl() appends connection_limit=10, pool_timeout=20,
  statement_timeout=30000 to DATABASE_URL in non-dev environments
- Prisma errors + warnings route through log() as structured JSON
- In dev: queries over 1000ms emit log("warn", "prisma.slow_query", {...})

**Rules:**
- Never instantiate PrismaClient anywhere except app/_lib/db/prisma.ts
- Never run transactions without a timeout — transactionOptions is set globally
- Never add raw SQL without statement_timeout awareness

---

### Distributed cache — Upstash Redis

Redis client singleton: app/_lib/redis/client.ts
Import: import { redis } from "@/app/_lib/redis/client"

Never instantiate Redis directly. Never use @upstash/redis outside this singleton.

Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

Current usage:
- Rate limiting (checkout, payment intent, bookings) via @upstash/ratelimit
- Rate limiter: app/_lib/rate-limit/checkout.ts — sliding window, Upstash-backed

The old in-memory Map() rate limiter is fully removed. Never reintroduce it.
In-memory state resets on every deploy and is bypassed across Vercel instances.

---

### Rate limiting — Upstash Ratelimit

app/_lib/rate-limit/checkout.ts — distributed rate limiter, Upstash-backed.

Public function: checkRateLimit(prefix, maxRequests, windowMs): Promise<boolean>
Identifier format: prefix:clientIp (resolved from X-Forwarded-For)

Limits are set per-caller (e.g. 10 per 60min for checkout, 20 per 60min for bookings).
Analytics: enabled — visible in Upstash dashboard.
Dev mode: bypasses rate limiting entirely.

All checkout, payment-intent, booking, and update-guest routes call checkRateLimit()
before any business logic. Never add a new payment or booking route without it.

---

### Resilient HTTP — resilientFetch

app/_lib/http/fetch.ts is the ONLY place external HTTP calls are made.

Every adapter, every integration, every third-party API call uses resilientFetch().
Never call native fetch() directly for external services.

    import { resilientFetch } from "@/app/_lib/http/fetch"

    const response = await resilientFetch(url, {
      service: "mailchimp",   // required — appears in structured logs
      timeout: 10_000,        // required — always set explicitly
      retries: 0,             // optional — defaults to 0
    })

Timeout values by service category:
- Email marketing (Mailchimp etc.): 10_000ms
- Analytics/ads (Google Ads, Meta Ads): 8_000ms
- PMS adapters (Mews etc.): 15_000ms — PMS APIs can be legitimately slow
- Webhook delivery: 10_000ms
- All other external calls: 10_000ms

What resilientFetch provides automatically:
- AbortController timeout on every call
- Structured log on timeout: log("error", "http.timeout", { service, url, duration })
- Structured log on error: log("error", "http.error", { service, url, attempt })
- Slow response warning at >3s: log("warn", "http.slow_response", {...})
- URL sanitization in logs (strips tokens/API keys from query params)

Do NOT use resilientFetch for:
- Internal Next.js fetch() calls to /api/* routes
- Stripe SDK (has its own timeout handling)
- Clerk SDK (same)
- Prisma (not HTTP)

Currently wired in:
- app/_lib/apps/email-marketing/adapters/mailchimp.ts (8 calls)
- app/_lib/apps/google-ads/oauth.ts (3 calls)
- app/_lib/apps/google-ads/conversions.ts (2 calls)
- app/_lib/apps/meta-ads/oauth.ts (2 calls)
- app/_lib/apps/meta-ads/conversions.ts (1 call)
- app/_lib/apps/webhooks.ts (1 call)
- app/_lib/integrations/adapters/mews/client.ts (1 call, 15s timeout)

---

### Email retry queue

sendEmailEvent() in app/_lib/email/send.ts is the ONLY entry point for email.

Email failures are never silently dropped. Every failed send is retried
automatically with exponential backoff via a cron job.

Retry schedule (attempts → delay before next retry):
  1st failure → retry in 5 minutes
  2nd failure → retry in 15 minutes
  3rd failure → retry in 1 hour
  4th failure → retry in 4 hours
  5th failure → retry in 24 hours
  After 5 attempts → status = PERMANENTLY_FAILED, never retried again

Key additions to EmailSendLog model:
  status: EmailSendStatus (QUEUED | SENT | FAILED | PERMANENTLY_FAILED)
  attempts: Int
  lastAttemptAt: DateTime?
  nextRetryAt: DateTime?
  failureReason: String?
  variables: Json? — template variables stored for retry replay

Retry cron: app/api/cron/retry-emails/route.ts
  Schedule: every 5 minutes (vercel.json)
  Batch size: 50 per run
  Auth: CRON_SECRET bearer token (same as all other crons)
  Pattern: orchestrator only — calls retrySendFromLog(logId), never sends directly

retrySendFromLog(logId) — exported from send.ts, used by cron only.
  Reads stored variables from log entry and replays via attemptSend().

**Rules:**
- Never call resendClient directly — always go through sendEmailEvent()
- Email failures must never abort sync, checkout, or booking flows
- safeSend() wraps every email trigger — failures are caught and logged only
- PERMANENTLY_FAILED emails must be visible in admin monitoring

---

### Caching strategy — Shopify model

Every route has an explicit, motivated cache decision. Nothing is force-dynamic
without a documented reason. Nothing is cached without knowing the invalidation path.

**Cache decision per route type:**

ALWAYS force-dynamic (never cache — user-specific or transactional):
  - All /portal/* pages (guest session, orders, account)
  - All /checkout/* pages (payment, PaymentIntent)
  - All /p/[token]/* pages (booking-specific per guest)
  - /login/* (auth, magic link consumption, DB writes)
  - /order-status/* (live order status)
  - /check-in/*, /check-out/*

ISR with revalidate (cache + background revalidation):
  - /shop/products/[slug] → revalidate: 60 (product data)
  - /shop/collections/[slug] → revalidate: 60
  - /shop/gift-cards/* → revalidate: 60
  - /auth/login/[slug] → revalidate: 300 (tenant branding)

Static (no server data, build-time only):
  - /stays/confirmation (renders from URL params only)
  - /auth/error (hardcoded error text)

**unstable_cache() on shared hot-path functions:**

getTenantConfig() — app/(guest)/_lib/tenant/getTenantConfig.ts
  Cache key: ["tenant-config", tenantId]
  TTL: 300s (5 minutes)
  Tag: tenant-config:{tenantId}
  Invalidated by: publishDraft.ts + updateMenusLive.ts via revalidateTag()

resolveTenantFromHost() DB lookup — app/(guest)/_lib/tenant/resolveTenantFromHost.ts
  Cache key: ["tenant-by-host", host]
  TTL: 300s
  Tag: tenant-by-host:{host}
  Note: only the DB lookup is cached — setSentryTenantContext() runs every request

**Cache-Control headers (next.config.ts):**
  /_next/static/*  → public, max-age=31536000, immutable (1 year)
  /media/*         → public, max-age=3600, stale-while-revalidate=86400
  /api/*           → no-store
  Everything else  → Next.js ISR/static defaults (no catch-all no-store)

The old global no-store catch-all is permanently removed. Never reintroduce it.

**Cache invalidation on admin publish:**
publishDraft.ts and updateMenusLive.ts call both:
  revalidatePath("/(guest)", "layout")   — path-based
  revalidateTag(`tenant-config:${tenantId}`, { expire: 0 })  — tag-based

Never add a new admin mutation that writes to TenantConfig without
also calling revalidateTag(`tenant-config:${tenantId}`, { expire: 0 }).

---

### Database indexes

These composite indexes are in schema.prisma and must never be removed:

  Booking: @@index([tenantId, guestEmail])
    — covers guest portal session lookups

  Order: @@index([status, createdAt])
    — covers reconciliation cron + admin order views

  EmailSendLog: @@index([status, nextRetryAt])
    — covers email retry cron query

When adding new models or query patterns that filter by tenantId +
another column, always add a @@index. Never add a query without first
checking if an index exists for that filter combination.

---

### Structured logging

app/_lib/logger.ts — log(level, event, ctx) is the ONLY logging entry point.
Output: JSON with timestamp, level, event name, and context object.

Usage:
  log("info",  "order.created",    { tenantId, orderId, amount })
  log("warn",  "prisma.slow_query", { duration, query })
  log("error", "http.timeout",      { service, url, duration })

Never use console.log, console.warn, or console.error in new application code.
console.* produces unstructured output invisible in production monitoring.

All log events must include tenantId when it is available in scope.
All payment and order lifecycle events must be logged.

Current known gap: 152 console.* calls remain in the codebase as of the
enterprise audit. These are P2 — being migrated progressively.
Every new file must use log(), never console.*.

---

### Infrastructure invariants — never violate these

1. Sentry tenantId context is set before any business logic on every request
2. PrismaClient is instantiated exactly once — in app/_lib/db/prisma.ts
3. Redis client is instantiated exactly once — in app/_lib/redis/client.ts
4. All external HTTP calls go through resilientFetch() with service name + timeout
5. Email is always sent through sendEmailEvent() — never resendClient directly
6. Failed emails are retried — never silently dropped
7. Rate limiting is applied to all checkout, payment, and booking routes
8. getTenantConfig() and resolveTenantFromHost() DB lookups are always cached
9. Every admin mutation to TenantConfig calls revalidateTag() for cache invalidation
10. No global no-store header — cache decisions are per-route and explicit
11. No in-memory Map() for distributed state — Upstash Redis for everything
12. Structured logging only — console.* is banned in new code
13. Every new external service integration uses resilientFetch() from day one
14. Every new cron job follows the CRON_SECRET auth pattern and batches with take: N

---

## Discount system

Shopify-grade discount engine supporting both automatic and code-based
discounts, percentage or fixed amount, order-level or line-item-level.

### Key files

- Types + validation: `app/_lib/discounts/types.ts`
- Code normalization + lookup: `app/_lib/discounts/codes.ts`
- Condition evaluation (pure, no DB): `app/_lib/discounts/eligibility.ts`
- Engine (sole entry point for resolution): `app/_lib/discounts/engine.ts`
- Transaction application: `app/_lib/discounts/apply.ts`
- Preview endpoint: `app/api/checkout/validate-discount/`
- Checkout integration: `app/api/checkout/create/` (discount-aware)
- Admin CRUD API: `app/api/admin/discounts/`

### Targeting architecture

Discount targeting uses normalized relation tables, not EAV jsonValue:
- `DiscountProduct` — specific product targeting (FK to Product)
- `DiscountCollection` — collection targeting (FK to ProductCollection)
- `DiscountSegment` — segment targeting (FK to GuestSegment)
- `DiscountCustomer` — specific customer targeting (FK to GuestAccount)

`Discount.appliesToAllProducts` and `Discount.appliesToAllCustomers` are
explicit boolean flags — never infer scope from absence of relations.
`Discount.minimumAmount` and `Discount.minimumQuantity` are typed fields
on Discount — not EAV condition rows.

Segment membership is pre-fetched by engine.ts before condition evaluation.
eligibility.ts never does DB calls — all context is injected by the engine.
- Admin UI: `app/(admin)/discounts/`

### Data models

  Discount — core definition (method, valueType, value, targetType, status, dates, usageLimit)
  DiscountCode — one discount can have many codes (@@unique([tenantId, code]))
  DiscountCondition — AND-logic conditions (MIN_NIGHTS, DAYS_IN_ADVANCE, etc.)
  DiscountAllocation — how discount was distributed across an order's line items
  DiscountUsage — one per order (@unique orderId), tracks who used what
  DiscountEvent — append-only audit log (CREATED, UPDATED, ENABLED, DISABLED, etc.)

### Discount invariants — never violate these

1. `evaluateDiscountCode()` and `evaluateAutomaticDiscount()` in engine.ts
   are the ONLY functions that determine discount eligibility. No route
   or component may perform its own eligibility check.
2. `applyDiscountInTx()` in apply.ts MUST be called inside an existing
   Prisma `$transaction`. It never opens its own transaction. Any caller
   that calls it outside a transaction is incorrect.
3. `usageCount` on Discount and DiscountCode is incremented atomically
   via `$executeRaw` (`UPDATE ... SET "usageCount" = "usageCount" + 1`).
   Never use `prisma.discount.update({ data: { usageCount: { increment: 1 } } })`.
4. All discount amounts are stored in ören (integer). Never floats.
   Never convert to/from SEK inside the discount engine.
5. `evaluateDiscountCode()` is called TWICE for code discounts:
   once before transaction for preview/early rejection (non-authoritative),
   once inside applyDiscountInTx via the SELECT FOR UPDATE lock (authoritative).
   The pre-transaction call result must NEVER be trusted for the final amount.
6. `ONCE_PER_CUSTOMER` condition ALWAYS fails closed when guestEmail
   is absent. Never skip the uniqueness check — return CONDITION_NOT_MET.
7. `DiscountUsage` has `onDelete: Restrict` on the Discount relation.
   A Discount with usage records CANNOT be deleted at the DB level.
   Route-level guard (usageCount > 0 → soft delete) is the application
   layer. The DB constraint is the safety net.
8. `Order.discountAmount` is SET (not incremented) in applyDiscountInTx.
   Setting the same value twice is idempotent. Incrementing is not.
9. Discount codes are always normalized before storage and lookup:
   `normalizeCode(raw) = raw.trim().toUpperCase()`
   A code entered as "summer20 " must match "SUMMER20" in the DB.
10. `chargeAmount` (what Stripe receives) = `Math.max(0, order.totalAmount - discountAmount)`.
    Stripe NEVER receives the pre-discount `totalAmount`. The Order records
    both `totalAmount` (original) and `discountAmount` for audit.
