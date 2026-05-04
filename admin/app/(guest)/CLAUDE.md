# Booking engine surface — `(guest)`

The public-facing storefront. Lives on tenant subdomains
(`{portalSlug}.rutgr.com`). Renders the visual-editor output, hosts
checkout, and runs the guest portal (booking management for paid guests).

> Route-group meaning: `(guest)` is a Next.js route group — it does NOT
> appear in URLs. The actual paths are `/`, `/checkout`, `/p/[token]`, etc.
> served on the tenant subdomain.

---

## Top-level routes

| Path | Owner | Purpose |
|---|---|---|
| `/` | `page.tsx` | Booking-engine home (renders TenantConfig) |
| `/search` | `search/` | Availability search |
| `/stays` | `stays/` | Accommodation index + detail |
| `/checkout` | `checkout/` | Embedded Stripe Elements (accommodation flow) |
| `/shop` | `shop/` | Product catalog + cart + Stripe Checkout Session flow |
| `/p/[token]` | `p/` | Guest booking portal (per-booking deep link) |
| `/portal` | `portal/` | Authenticated guest portal (multi-booking) |
| `/check-in`, `/check-out` | `check-in/`, `check-out/` | Self-service check-in/out |
| `/account`, `/login`, `/register` | `account/`, `auth/` | Guest account |
| `/order-status` | `order-status/` | Live order status (post-checkout) |
| `/invoice` | `invoice/` | Public invoice page (draft-order share token) |
| `/no-booking` | `no-booking/` | Tenant has no PMS configured |
| `/email-unsubscribe`, `/unsubscribe` | … | Email opt-out |
| `/robots.txt`, `/sitemap.xml`, `/sitemap_[shard]` | route handlers | SEO surface |

The visual editor's section model renders on these routes — see
`_lib/sections/CLAUDE.md` and `_lib/themes/`.

---

## Tenant resolution

`_lib/tenant/resolveTenantFromHost.ts` is the SINGLE function that maps
the request host (`{portalSlug}.rutgr.com`) to a `Tenant` row. Every
guest-side route MUST call this — `tenantId` is never accepted from
request bodies. See `observability/CLAUDE.md` for the cache + Sentry
context wiring.

`_lib/tenant/getTenantConfig.ts` returns the published `TenantConfig`
JSON, with v1 → v2 migration applied. Cached via `unstable_cache()` —
invalidated on admin publish via `revalidateTag()`.

---

## Themes engine

`_lib/themes/engine.tsx` — renders a TenantConfig page by walking
`config.pages[pageId].sections` and resolving each through the section
registry. SectionErrorBoundary isolates failures so one broken section
doesn't take the page down.

`manifests/` — theme presets (full-page templates).
`sections/` — guest-side section renderers (the actual React components).
`migrations.ts` — TenantConfig migrations applied on read.
`validation.ts` — runtime shape validation (defends against corrupt config).

---

## Cache decisions per route type

(Mirrors the policy in `observability/CLAUDE.md`.)

ALWAYS force-dynamic (user-specific or transactional):
- `/portal/*`, `/checkout/*`, `/p/[token]/*`, `/login/*`,
  `/order-status/*`, `/check-in/*`, `/check-out/*`

ISR with revalidate (cache + background revalidation):
- `/shop/products/[slug]` → revalidate: 60
- `/shop/collections/[slug]` → revalidate: 60
- `/shop/gift-cards/*` → revalidate: 60
- `/auth/login/[slug]` → revalidate: 300

Static (no server data, build-time only):
- `/stays/confirmation`, `/auth/error`

---

## Locale handling

URL pattern `/p/[token]/[locale]/...` rewrites to `/p/[token]/...` via
middleware. Locale validation runs in `app/api/translations/locales/published/`
(Edge runtime cannot import Prisma directly). See
`_lib/translations/CLAUDE.md`.

---

## Cart

`_lib/cart/` — client-side localStorage cart, server-validated at
checkout via `validateCart()`. Key: `bf_cart_{tenantId}`. NOT a DB
model; survives nothing across devices.

---

## Key sub-libs

- `_lib/tenant/` — host → tenant resolution + config loading
- `_lib/themes/` — section renderer + theme engine
- `_lib/portal/` — guest portal session + booking resolution
- `_lib/booking/` — booking-page rendering helpers
- `_lib/products/` — storefront product queries
- `_lib/cart/` — client cart
- `_lib/i18n.ts`, `_lib/locale/` — locale helpers
- `_lib/sitemap/` — sitemap shard generation
- `_lib/rules/`, `_lib/features/`, `_lib/weather/`, `_lib/footer/`,
  `_lib/product-context/` — supporting helpers

---

## Guest-surface invariants — never violate

1. `tenantId` always resolved from host — NEVER from request body
2. `setSentryTenantContext()` runs in BOTH dev and prod branches of `resolveTenantFromHost`
3. `getTenantConfig()` is cached via unstable_cache — admin mutations call `revalidateTag()`
4. Section render goes through `themes/engine.tsx` — never bypass to render config directly
5. SectionErrorBoundary wraps every section — one broken section never crashes the page
6. Cache decisions per route are explicit (force-dynamic / revalidate / static) — no global no-store
7. Cart is localStorage only — never a DB model, always server-validated at checkout
8. Locale validation in middleware reads from internal API — middleware can't import Prisma
9. Public pages emit canonical SEO via `_lib/seo/` — never hand-roll `<head>` content
10. `/p/[token]` is the booking-deep-link — token is the auth boundary, never accept tenantId from query string
