# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Stack-aware loading.** Domain-specific guidance lives in nested `CLAUDE.md`
> files inside the relevant module — Claude loads them automatically when
> working in that area. This root file holds only what is universal across the
> codebase. See "Domain map" at the bottom.

---

## Roles in this workspace — READ FIRST

There are TWO Claude instances at work in this repo. They have
different responsibilities and must NOT swap roles. Confusing the two
caused real production-pipeline incidents in early sessions; this
section exists to prevent recurrence.

### Web Claude — claude.ai/code
- Full repository context across all files (sees the whole tree).
- NO local execution environment: no `npm install`, no `tsc`, no
  `vitest`, no `next dev`, no live verification. Pushing untested
  code to the deploy branch is forbidden — Vercel is **not** a
  compiler.
- **Role: prompt engineer / architect / reviewer.** Produces:
  - Recon docs (`_audit/<phase>-recon.md`)
  - Roadmap updates (`_audit/draft-orders-roadmap.md`, etc.)
  - **Prompts to be pasted into Terminal Claude** by the operator
  - Reviews of Terminal Claude's output that the operator pastes back
- **Never edits source files. Never runs `git push` against
  application code.** The only files Web Claude may write/commit
  directly are markdown planning documents and `CLAUDE.md` itself —
  and even those, sparingly.

### Terminal Claude — Claude Code in the operator's codespace
- Full dev environment: deps installed, can run the full toolchain.
- **Role: implementer.** Reads the prompt the operator pastes,
  executes it (`Edit`/`Write`/`Bash`), runs `tsc` / `vitest` / `eslint`
  / `next dev` to verify locally, and only pushes once green.
- Does NOT write recon or planning docs; that is Web Claude's job.

### The operator (the human)
- Bridge between the two instances.
- Pastes Web Claude's prompt into the terminal.
- Pastes relevant Terminal Claude output back into Web Claude.
- Final authority on scope, priorities, merging, and deploys.

### Workflow contract — every phase

1. **Web Claude** drafts a recon doc; operator reviews + approves.
2. **Web Claude** writes a paste-ready prompt for Terminal Claude.
3. **Operator** pastes the prompt into the terminal.
4. **Terminal Claude** implements + runs `tsc` + `vitest` + `eslint`
   + (for UI) `next dev` smoke. Iterates until all checks are green.
5. **Terminal Claude** commits + pushes only when verified locally.
6. **Operator** reports back to Web Claude (results, deploy status).
7. Roadmap updated, next phase scoped.

### When in doubt

> **"What would Shopify do?"** (see THE BAR section below)

Web Claude does not push half-thought work to Vercel as a canary.
Web Claude writes a prompt. Terminal Claude executes it locally,
verifies it locally, and pushes only when green. The operator
arbitrates.

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

**Quality bar: "Would Shopify approve this?"**
Every change — no matter how small or complex — must meet Shopify-level
enterprise standards. This applies to scalability, robustness, race safety,
error handling, UX polish, code structure, and architectural decisions.
No shortcuts, no "good enough for now", no tech debt disguised as pragmatism.
Every feature ships complete or not at all.

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

---

## Domain map — where the rest of the knowledge lives

Each subdomain has its own `CLAUDE.md` with deep architectural details,
invariants, and key files. Claude loads them automatically when working
in the relevant directory.

| Domain | Location |
|---|---|
| Pages, TenantConfig, visual editor | `app/_lib/pages/CLAUDE.md` |
| Section/Block/Element model + definitions | `app/_lib/sections/CLAUDE.md` (+ `INVARIANTS.md`) |
| PMS adapter layer (Mews/Apaleo/Opera) | `app/_lib/integrations/CLAUDE.md` |
| PMS reliability engine (inbox/outbound/holds/idempotency) | `app/_lib/integrations/reliability/CLAUDE.md` |
| Translation system (i18n) | `app/_lib/translations/CLAUDE.md` |
| Product catalog (variants, options, inventory) | `app/_lib/products/CLAUDE.md` |
| Commerce engine (orders, checkout, Stripe) | `app/_lib/orders/CLAUDE.md` |
| Email notification system (Resend, retry, magic link) | `app/_lib/email/CLAUDE.md` |
| Discount system | `app/_lib/discounts/CLAUDE.md` |
| Analytics pipeline (worker validator parity) | `app/_lib/analytics/pipeline/CLAUDE.md` |
| Enterprise infrastructure (Sentry, Redis, cache, logging) | `app/_lib/observability/CLAUDE.md` |
| Clerk auth + roles + org sync | `app/(admin)/_lib/auth/CLAUDE.md` |
| API routes index + cron jobs | `app/api/CLAUDE.md` |
