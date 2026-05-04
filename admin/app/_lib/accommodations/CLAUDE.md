# Accommodations

Domain logic for accommodation entities (rooms, cabins, camping spots).
Connects the platform's Product/Category model to the PMS-resolved
inventory and to the post-payment booking creation pipeline.

---

## Modules

| File | Owns |
|---|---|
| `queries.ts` | List + lookup accommodations for storefront and admin |
| `pricing.ts` | Per-night rate computation, pre-tax + with-tax variants |
| `addons.ts` | Resolve and validate addons (breakfast, parking, cleaning) |
| `resolve.ts` | accommodationId → PMS roomTypeId mapping per tenant |
| `sync.ts` | Pull room types from PMS adapter into platform Accommodation table |
| `facility-map.ts` | Normalize PMS facilities to canonical icons + Swedish labels |
| `create-pms-booking.ts` | Post-payment PMS booking creation (the critical one — see below) |

---

## create-pms-booking.ts (post-payment)

`createPmsBookingAfterPayment({ orderId, tenantId })` is called by the
outbound reliability pipeline after `payment_intent.succeeded`. It:

1. Loads the Order + linked Booking + line items
2. Routes through `resolveAdapter(tenantId)` to the right PMS
3. Hold path: `adapter.confirmHold(holdExternalId)` if a hold exists
4. No-hold path: `adapter.createBooking()` (legacy fallback for Manual provider)
5. Saves the resulting `pmsBookingRef` on the Booking
6. Emits OrderEvent + structured log

**Idempotent** — checks `pmsBookingRef` BEFORE calling the adapter; a
second invocation on the same Order is a no-op.

**Never called from a route directly.** Only from the outbound reliability
engine (`outbound.ts`) — that's where the retry ladder + compensation
phase live. See `_lib/integrations/reliability/CLAUDE.md`.

---

## resolve.ts (the adapter mapping)

Tenant maps platform Accommodation IDs to PMS roomTypeIds. Stored as a
relation `Accommodation.pmsRoomTypeId`. `resolveAccommodationToPmsRoomType()`
is the only lookup function — never inline `accommodation.pmsRoomTypeId`
checks because the resolver also handles the Manual / Fake adapter cases
where no mapping exists.

---

## Sync

`sync.ts::syncAccommodationsFromPms(tenantId)` — pulls `getRoomTypes()`
from the PMS adapter, upserts into the `Accommodation` table.

Called from:
- Apps install completion (Mews app set up)
- Manual "sync now" button in admin
- Nightly reconcile sweep (cold tier)

NOT called on every storefront request — availability lookups go straight
to `adapter.getAvailability()`. Sync is for the catalog (room types,
images, descriptions, facilities), not for live availability.

---

## Facility normalization

`facility-map.ts` translates PMS facility codes (Mews uses Czech-named
amenity IDs, Apaleo uses different codes) into a canonical set with
Material Symbols icons + Swedish labels. Adding a facility = one entry
in the canonical map + per-PMS source mappings.

---

## Pricing

`pricing.ts` exposes per-night rate computation. Inputs: rate plan,
nights, occupancy, addons. Output: line items with pre-tax + computed
tax (delegates to `_lib/tax`).

The pre-tax base is what Stripe receives via Connect (with platform fee
applied separately). The with-tax variant is what the storefront shows.

---

## Key files

- Queries: `app/_lib/accommodations/queries.ts`
- PMS booking creation: `app/_lib/accommodations/create-pms-booking.ts`
- Pricing: `app/_lib/accommodations/pricing.ts`
- Addons: `app/_lib/accommodations/addons.ts`
- Adapter mapping: `app/_lib/accommodations/resolve.ts`
- Sync from PMS: `app/_lib/accommodations/sync.ts`
- Facility normalisation: `app/_lib/accommodations/facility-map.ts`

---

## Dependencies

- `_lib/integrations` — adapter contract for getRoomTypes / getAvailability
- `_lib/integrations/reliability` — outbound pipeline calls create-pms-booking
- `_lib/tax` — pricing.ts delegates tax computation
- `_lib/orders` — Order ↔ Booking relation
- `_lib/seo` — accommodationSeoAdapter (in seo/adapters/)

---

## Accommodation invariants — never violate

1. `createPmsBookingAfterPayment` is idempotent — checks `pmsBookingRef` first
2. `createPmsBookingAfterPayment` is called ONLY from outbound reliability — never from routes
3. `resolveAccommodationToPmsRoomType()` is the only mapping resolver — never inline checks
4. PMS sync NEVER runs on storefront requests — availability goes through `adapter.getAvailability()` direct
5. Facility codes map through `facility-map.ts` — no PMS-specific codes leak into UI
6. Pricing returns BigInt ören — never floats
7. With-tax vs pre-tax are clearly typed — Stripe always receives pre-tax (+ platform fee separately)
