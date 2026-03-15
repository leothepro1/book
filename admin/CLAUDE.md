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
- Material Symbols Rounded for icons

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

---

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

---

## API routes

- `/api/media` — CRUD + thumbnails + stats + cleanup
- `/api/tenant/draft-config` — save unpublished config
- `/api/tenant/preview-stream` — live preview SSE
- `/api/webhooks/clerk` — org/user sync (Svix verification)
- `/api/wallet-card-design` — Apple/Google Wallet styling

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
