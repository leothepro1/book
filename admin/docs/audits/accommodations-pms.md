# Tenant-isolation audit — accommodations/PMS

**Domain agent:** `Audit accommodations/PMS tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

Accommodation, AccommodationCategory, AccommodationUnit,
AccommodationRestriction, AccommodationFacility, AccommodationHighlight,
AccommodationMedia, AccommodationCategoryAddon,
AccommodationCategoryItem, BedConfiguration, Booking, RatePlan,
SpotMap, SpotMarker, SpotMapAccommodation, PendingSpotReservation,
BookingSyncError.

## Summary

**~104 call-sites. 89 SAFE · 12 AMBIGUOUS · 3 UNSAFE (after
verification: 1 real critical, 2 false positives).**

## Key findings

### 🔴 `admin/app/page.tsx:64` — "Fake Booking Creator" leaks all tenants' bookings

**H1 in main report.** Dev-only scaffolding page at `/` that
`findMany`s bookings across all tenants with no where-clause, then
renders them in HTML. Currently not reachable via `www.rutgr.com`
(returns 404) but the code is in the production bundle. Must be
removed or gated.

### ⚠️ `Booking.portalToken` lookup

```ts
prisma.booking.findUnique({ where: { portalToken: token } })
```

Token is 24 random bytes (sufficient entropy) — cannot be enumerated.
Runtime-safe. Defense-in-depth: consider compound unique
`[tenantId, portalToken]`. Low priority (M9 in main report).

### ✅ PMS integration boundary

The `resolveAdapter(tenantId)` abstraction is the single entry point
for all PMS queries. Every PMS adapter call (Mews, Fake, Manual)
goes through this resolver, which means tenant scope is enforced
at the boundary. Queries inside adapter code may look unscoped but
are safe as long as they stay behind `resolveAdapter`.

### ✅ `resolveTenantFromHost` on guest routes

`/api/availability`, `/api/bookings/create`, `/checkout/*`,
`/p/[token]/*` all resolve tenant from subdomain header first, before
any business logic. Sentry tenant context is set immediately.

## Accommodation/Booking write pattern

Admin actions follow a consistent "verify-then-act" pattern:
1. `findFirst({ where: { id, tenantId } })` — ownership check
2. Business-logic check (e.g. order-count for delete)
3. `update` / `delete` — with only `id` in where

This is runtime-safe but defense-in-depth-weak (same pattern as
M1–M7 in products). Low priority to harden.

## Per-model highlights

- **Accommodation (tier-1):** 12 call-sites, all SAFE.
- **Booking (tier-1):** 18 call-sites. 16 SAFE, 1 critical (page.tsx
  above), 1 ambiguous (portalToken).
- **SpotMarker / SpotMap:** 8 call-sites, all SAFE via
  upstream `spotMap`/`accommodation` ownership check. The partial
  unique index (`WHERE accommodationUnitId IS NOT NULL`) added in
  fas B is enforced at the DB level.
- **PendingSpotReservation:** DB-level unique `checkoutSessionId`,
  FK to Tenant. All queries scoped.

## Recommended fixes

See main report:
- **H1** — remove `app/page.tsx` (critical)
- **M9** — portalToken compound unique (low priority)

No other domain-specific fixes required.
