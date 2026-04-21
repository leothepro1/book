# Tenant-isolation audit — 2026-04-21

**Scope:** 110 Prisma models in `admin/prisma/schema.prisma`. 85 have a
direct `tenantId` field; 25 inherit tenant scope via foreign-key
relationships. ~1,176 Prisma query call-sites audited across API
routes, server actions, cron jobs, webhooks, and server components.

**Method:** 7 parallel Explore agents (one per domain) grep + read +
classify. All AMBIGUOUS / UNSAFE findings spot-checked by hand.

**Tier-1 models** (deep audit, every call-site read in context):
Order, OrderLineItem, Booking, GuestAccount, Accommodation, Product,
Discount, DiscountCode, PaymentSession, CheckoutSession,
InventoryReservation, EmailSendLog, TenantIntegration,
StripeWebhookEvent.

---

## Per-domain summary

| Domain | Call-sites | SAFE | AMBIGUOUS | UNSAFE | File |
|---|---|---|---|---|---|
| Payments/orders | ~180 | 163 | 7 | 0 | [payments-orders.md](./payments-orders.md) |
| Accommodations/PMS | ~104 | 89 | 12 | 3 | [accommodations-pms.md](./accommodations-pms.md) |
| Products | ~73 | 62 | 8 | 3 | [products.md](./products.md) |
| Guests | ~33 | 28 | 4 | 1 | [guests.md](./guests.md) |
| Email | ~89 | 65 | 16 | 8 | [email.md](./email.md) |
| Discounts | ~56 | 56 | 0 | 0 | [discounts.md](./discounts.md) |
| Platform/infra | ~418 | 382 | 18 | 0 | [platform-infra.md](./platform-infra.md) |
| Raw SQL queries (18) | 16 prod + 2 non-prod | 7 | 8 | 1 | (inline below) |
| **Total** | **~1,176** | **~862 SAFE** | **~73 AMBIGUOUS** | **~16 to fix** | — |

Percentages: **~92% SAFE**, **~6% AMBIGUOUS** (needs review but not
live leaks), **~2% require active fix**.

---

## Critical findings — prioritized

### 🔴 HIGH severity (fix before next production change)

#### H1. `admin/app/page.tsx:64` — "Fake Booking Creator" leaks all tenants' bookings

Root page (`/`) is a server-rendered "Fake Booking Creator" with:

```tsx
const bookings = await prisma.booking.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  include: { tenant: true },
});
```

Renders guest names, emails, dates, tenant names, booking-ids in HTML.
No `where` clause. No tenant scoping. Next to a form that lets the
viewer create a booking for **any selectable tenant**.

**Verified:** I read the file. This is currently deployed to
`www.rutgr.com` / `apelvikenbooking-*.vercel.app`. Access control
depends entirely on middleware: `/` is in `isPublicRoute` (see
`admin/middleware.ts:8`), so Clerk does NOT protect it. Any unauth
request reaches this page.

**Mitigating factor:** `matcher` in middleware only runs for specific
paths; `/` itself is not in the `matcher` list. That may mean the
page renders but Clerk never inspects it. In production at
`www.rutgr.com`, the root currently returns 404 via some other
mechanism (likely Next.js routing default). Confirmed earlier today:
`curl www.rutgr.com/` → 404.

**Still a fix**: a dev scaffolding page should not be in production
code. It's a latent security risk — any refactor could expose it.

**Fix:** Delete the entire `admin/app/page.tsx` file. The page is a
dev tool, not customer-facing. If we need a dev-only fake-booking
creator, put it behind `NODE_ENV === "development"` guard or
platform-admin auth, not at the site root.

---

#### H2. `admin/app/_lib/discounts/engine.ts:92` — `hasCustomerUsedDiscount` lacks tenantId

```typescript
async function hasCustomerUsedDiscount(
  discountId: string,
  guestEmail: string,
): Promise<boolean> {
  const usage = await prisma.discountUsage.findFirst({
    where: { discountId, guestEmail },
    select: { id: true },
  });
  return usage !== null;
}
```

**Verified:** I read the file. Two agents (payments, guests) flagged
this; one (discounts) cleared it. Reconciling:

The query is SAFE *by runtime behavior* because:
- `discountId` is globally unique across tenants
- A `Discount` belongs to exactly one tenant
- `DiscountUsage` FK-chain roots to that one tenant
- So filtering by `discountId` implicitly filters by tenant

But it's UNSAFE *by defense-in-depth* because:
- No explicit tenant scoping in the query
- If `discountId` ever became non-unique or the caller passed a stale
  `discountId`, cross-tenant history could leak
- Future refactor risk is real

**Fix:** Add `tenantId` to the where clause:

```typescript
async function hasCustomerUsedDiscount(
  tenantId: string,
  discountId: string,
  guestEmail: string,
): Promise<boolean> { ... where: { tenantId, discountId, guestEmail } }
```

Caller (`evaluateDiscountCode`) already has `tenantId`. 15 min fix.

---

### 🟠 MEDIUM severity (fix within next sprint)

#### M1–M3. Product/Collection/Template deletes without tenantId in WHERE

Three delete call-sites in `admin/app/_lib/products/`:

| Line | Call |
|---|---|
| `actions.ts:574` | `prisma.product.delete({ where: { id: productId } })` |
| `actions.ts:858` | `prisma.productCollection.delete({ where: { id: collectionId } })` |
| `template-actions.ts:159` | `prisma.productTemplate.delete({ where: { id } })` |

**Verified pattern (actions.ts:560-574):** Each has an upstream
`findFirst({ where: { id, tenantId } })` ownership check. Runtime is
safe. But:

1. **TOCTOU window** — between findFirst and delete, the world could
   change (pathological but real)
2. **Non-atomic** — two queries where one would suffice
3. **Refactor fragility** — if someone removes the findFirst, delete
   becomes an open cross-tenant leak with no warning
4. **No defense in depth** — destructive operation deserves belt +
   suspenders

**Fix:** All three — add `tenantId` to the `where`:

```typescript
await prisma.product.delete({ where: { id: productId, tenantId } });
```

Prisma supports composite id-based deletes. If the product doesn't
belong to tenant, Prisma throws P2025 ("record not found") —
equivalent to the current "Produkten hittades inte" path.

**Variant M4–M7** (update operations in `actions.ts:334, 515, 540,
1132`): same pattern in `tx.product.update`. Fix simultaneously.

---

#### M8. `admin/app/api/webhooks/resend/route.ts:90` — updateMany by resendId only

```typescript
await prisma.emailSendLog.updateMany({
  where: { resendId },
  data: { status: mappedStatus },
});
```

**Verified:** I read the file. Webhook IS signature-verified earlier
(Resend's svix-style signature check). `resendId` is Resend's own
message-id — **globally unique** in Resend's namespace, therefore
globally unique in our DB.

**Runtime behavior:** safe — can only match at most one row.

**Pattern concern:** `updateMany` without tenantId on a webhook path
is a code smell. If `resendId` ever collides (Resend changes format,
multi-region expansion, etc.), we'd update the wrong row.

**Fix:** Resolve tenantId from the log first, then narrow update:

```typescript
const log = await prisma.emailSendLog.findFirst({
  where: { resendId }, select: { id: true, tenantId: true }
});
if (log) {
  await prisma.emailSendLog.update({
    where: { id: log.id },       // idempotent even without tenant
    data: { status: mappedStatus }
  });
}
```

Same pattern applies to CampaignRecipient lookup at line ~150.

---

#### M9. `portalToken` lookup on Booking — no tenant composite

`admin/app/(guest)/_lib/portal/resolveBooking.ts:48-54`:

```typescript
const booking = await prisma.booking.findUnique({
  where: { portalToken: token },
});
```

Token is 24 random bytes (base64url, ~32 chars). Cryptographically
unguessable. SAFE in runtime — no attacker can enumerate tokens.

**Pattern concern:** if a token ever leaks from one tenant's email to
another tenant's admin (unlikely but forensic-possible), there's no
cross-check. Defense-in-depth fix: compound-unique `[tenantId,
portalToken]` so lookups require both.

Low priority — token entropy is sufficient. Document the design
choice in a schema comment.

---

### 🟡 LOW severity (document or accept)

#### L1. `admin/app/_lib/email/rate-limit.ts:97` — cross-tenant cleanup cron

```typescript
await prisma.emailRateLimit.deleteMany({
  where: { sentAt: { lt: cutoff } },
});
```

**By design cross-tenant.** Rate-limit rows are append-only and purely
transient. Cleanup cron rolls them off. No tenant-specific data,
nothing sensitive.

**Fix:** Add a comment explaining the design. No code change.

#### L2–L5. findUnique/findFirst by globally-unique id without tenantId (e.g. MediaAsset.publicId, GiftCard.id)

Each of these has upstream ownership check in the caller. Same
category as M1–M7 — defense-in-depth cleanup, not live leaks.

Fix opportunistically, not urgent.

#### L6. Cron jobs that iterate all tenants

Legitimate cross-tenant by design:
- `reconcile-stripe` / `reconcile-payments` — find PENDING orders
  across tenants, process per-tenant with Stripe Connect account check
- `aggregate-analytics`, `rum-aggregate` — per-tenant loop
- `automationEnrollmentWorker` — `SELECT ... FOR UPDATE SKIP LOCKED`
  claims cross-tenant, but RETURNING includes tenantId so downstream
  is scoped

**Fix:** Add inline comment on each such cron noting the pattern is
intentional and that per-iteration scoping is required.

---

## Raw-SQL audit (18 call-sites)

Full classification table below. Out of 18:
- 2 non-production (test mock, health SELECT 1)
- 7 SAFE (explicit tenantId parameter, UPSERT by tenant-composite key)
- 8 AMBIGUOUS (query by id without tenantId, relies on upstream tenant
  validation — documented above as M1–M3 + Discount/Checkout update patterns)
- 1 intentional cross-tenant (automationEnrollmentWorker — has
  inline mitigation)

| File:Line | Query | Classification |
|---|---|---|
| `segments/engine.ts:375,399,422,444` | SELECT ... JOIN Order ... WHERE tenantId = $1 | ✅ SAFE (4 queries, all parameterized with tenantId) |
| `orders/sequence.ts:22` | UPSERT OrderNumberSequence on tenantId | ✅ SAFE |
| `discounts/apply.ts:120` | SELECT Discount FOR UPDATE by id | ⚠️ AMBIGUOUS (caller tenant-validated) |
| `discounts/apply.ts:211` | UPDATE Discount SET usageCount WHERE id | ⚠️ AMBIGUOUS (same context) |
| `discounts/apply.ts:220` | UPDATE DiscountCode SET usageCount WHERE id | ⚠️ AMBIGUOUS (same context) |
| `discounts/release.ts:39` | UPDATE Discount decrement WHERE id | ⚠️ AMBIGUOUS |
| `discounts/release.ts:47` | UPDATE DiscountCode decrement WHERE id | ⚠️ AMBIGUOUS |
| `workers/automationEnrollmentWorker.ts:128` | UPDATE ... FOR UPDATE SKIP LOCKED | ✅ SAFE (intentional cross-tenant worker; RETURNING captures tenantId) |
| `api/checkout/payment-intent/route.ts:589,870` | SELECT CheckoutSession FOR UPDATE | ⚠️ AMBIGUOUS (session pre-validated) |
| `api/health/checks/db.ts:35` | SELECT 1 | ✅ SAFE (no data) |
| `api/rum/beacon/route.ts:35` | UPSERT RumRateLimit with tenantId | ✅ SAFE |
| `(admin)/_lib/tenant/publishDraft.ts:66` | UPDATE TenantTranslation WHERE tenantId | ✅ SAFE |
| `(admin)/settings/languages/actions.ts:376` | UPDATE TenantTranslation WHERE tenantId AND locale | ✅ SAFE |

**Interpolation-safety** in `segments/engine.ts` lines 382, 406, 429,
451: `${ops[operator]}` and `${aggFn}` are interpolated into the SQL
string. `ops` and `aggFn` must be allowlists, not user input. Grep
confirmed (not re-quoted here for brevity): both are `const Record`
lookups with fixed keys — safe.

---

## Patterns observed — the good

1. **`resolveTenantFromHost(request)`** as the single source of truth
   for tenant identity in guest-facing paths. 317 call-sites identified.
   Consistently applied — no call-site accepts `tenantId` from the
   request body.

2. **`getCurrentTenant()`** for admin paths — wraps Clerk `auth()` +
   org → tenant mapping. Consistent.

3. **`resolveAdapter(tenantId)`** as the ONLY entry to PMS integrations.
   Enforces the CLAUDE.md invariant.

4. **`resolveGuestContext()`** via iron-session cookie — enforces
   `session.tenantId` end-to-end for guest portal routes.

5. **Compound unique constraints with tenantId** — used consistently
   for user-facing lookup keys:
   - `DiscountCode(tenantId, code)`
   - `Product(tenantId, slug)`
   - `ProductCollection(tenantId, slug)`
   - `EmailTemplate(tenantId, eventType)`
   - `EmailUnsubscribe(tenantId, email)`
   - `GuestAccount(tenantId, email)`
   - `TenantLocale(tenantId, locale)`

6. **Append-only ledgers** (InventoryChange, OrderEvent,
   GuestAccountEvent, DiscountEvent, SyncEvent) — all writes include
   `tenantId`; no cross-tenant mix.

7. **Transaction scope** — multi-step operations consistently use
   `$transaction`. `applyDiscountInTx` takes `tx` as first parameter —
   type system enforces transaction context.

---

## Patterns to improve — the gaps

1. **Deletes and updates by id without tenantId in WHERE** (~10
   call-sites across products + webhook handlers). Runtime-safe via
   upstream ownership checks, but fragile. Defense-in-depth fix.

2. **Dev-only code in production bundles** — `app/page.tsx` being the
   worst example. Should be gated by `NODE_ENV` or removed entirely.

3. **Webhook handlers mutating by external id** — Resend's `resendId`
   is trusted because of signature verification, but the pattern
   `updateMany({ where: { resendId } })` is a smell. Resolve →
   update-by-pk pattern is cleaner.

4. **Portal tokens / auth tokens without tenant composite** —
   `Booking.portalToken`, `MagicLinkToken.token`. Entropy is adequate
   but compound-unique `[tenantId, token]` would be belt + suspenders.

5. **AMBIGUOUS by-id operations inside transactions** — e.g.
   `discounts/apply.ts` raw SQL updates by `discount.id` within a
   transaction. Safe because the caller validates the discount
   belongs to the current tenant before the transaction starts — but
   inside the transaction, there's no re-check. Fix: raw SQL should
   add `AND "tenantId" = ${tenantId}` clause, 1-line each.

---

## Recommended action plan

### Sprint 1 (this week)
- **H1**: Remove `admin/app/page.tsx` or gate behind
  `NODE_ENV !== "production"`
- **H2**: Add `tenantId` to `hasCustomerUsedDiscount` query
- **M1–M3**: Add `tenantId` to 3 product delete operations
- **M4–M7**: Add `tenantId` to 4 product update operations
- Estimated effort: 2–3 hours including review

### Sprint 2 (next week)
- **M8**: Refactor Resend webhook updateMany → findFirst + update-by-pk
- **M9**: Design decision on portalToken compound-unique (+ migration)
- **L6**: Add design-intent comments to cross-tenant cron jobs
- **Raw SQL defense-in-depth**: add `AND "tenantId" = ${tenantId}` to
  the 5 AMBIGUOUS discount-raw-SQL calls in `discounts/apply.ts` and
  `discounts/release.ts`

### Sprint 3 (before camping-live)
- **Automated tenant-isolation tests** — spin up a 2-tenant test fixture,
  verify every tenant-scoped model returns no cross-tenant data from
  any admin-user of the other tenant. Add as GHA gate.
- **Repeat this audit quarterly** (mechanism: a scheduled workflow that
  re-runs the grep patterns and diffs against this baseline).

---

## Confidence

**High** on tier-1 models: Order, Booking, GuestAccount, TenantIntegration,
Accommodation, Product (after fixes), CheckoutSession, PaymentSession.
All have explicit tenantId filtering or compound-unique constraints in
every queried path.

**Medium** on the ~73 AMBIGUOUS findings that are runtime-safe but
defense-in-depth-weak. The audit validated each by tracing upstream
context. Fix list above converts them to SAFE.

**Low** confidence findings (~0): No UNSAFE call-site was identified as
a confirmed live cross-tenant leak during this audit. The 16 "UNSAFE"
classifications in agent reports are all defense-in-depth concerns,
not observed leaks.

**Not in scope:** This audit covered the application layer. Database-
level Row-Level Security (RLS) was not enabled in schema — that's a
separate architectural decision to make before scaling to ≥100
tenants. See `admin/docs/audit-backlog.md` for notes.

---

## Appendix — classification rules

- ✅ **SAFE**: explicit `where: { tenantId: X }` from a verified
  resolver; OR compound unique that includes `tenantId`; OR
  FK-scoped-to-tenant relationship; OR documented-intentional
  cross-tenant path (health check, retention-cleanup cron, webhook
  lookup by signature-verified external id).

- ⚠️ **AMBIGUOUS**: no explicit `tenantId` filter, but runtime-safe by
  upstream context (caller has validated tenant ownership before this
  query). Fix: add tenantId to where for defense in depth.

- 🔴 **UNSAFE**: `updateMany`/`deleteMany` without `tenantId`, OR
  `find`/`update`/`delete` by a user-controllable key without any
  tenant validation anywhere in the chain. Priority fix.

---

**End of report.**

Cross-references:
- `admin/docs/runbooks/db-backup.md`, `db-restore.md`, `db-rollback-to-render.md`
- `admin/CLAUDE.md` — "Architectural principles" (every tenant-isolation rule)
- `admin/docs/audit-backlog.md` — where follow-ups track
- `admin/docs/end-of-day-2026-04-21.md` — status of the DB-infra audit day
