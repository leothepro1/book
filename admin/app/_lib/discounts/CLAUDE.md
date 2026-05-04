# Discount system

Shopify-grade discount engine supporting both automatic and code-based
discounts, percentage or fixed amount, order-level or line-item-level.

---

## Targeting architecture

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

---

## Data models

  Discount — core definition (method, valueType, value, targetType, status, dates, usageLimit)
  DiscountCode — one discount can have many codes (@@unique([tenantId, code]))
  DiscountCondition — AND-logic conditions (MIN_NIGHTS, DAYS_IN_ADVANCE, etc.)
  DiscountAllocation — how discount was distributed across an order's line items
  DiscountUsage — one per order (@unique orderId), tracks who used what
  DiscountEvent — append-only audit log (CREATED, UPDATED, ENABLED, DISABLED, etc.)

---

## Key files

- Types + validation: `app/_lib/discounts/types.ts`
- Code normalization + lookup: `app/_lib/discounts/codes.ts`
- Condition evaluation (pure, no DB): `app/_lib/discounts/eligibility.ts`
- Engine (sole entry point for resolution): `app/_lib/discounts/engine.ts`
- Transaction application: `app/_lib/discounts/apply.ts`
- Preview endpoint: `app/api/checkout/validate-discount/`
- Checkout integration: `app/api/checkout/create/` (discount-aware)
- Admin CRUD API: `app/api/admin/discounts/`
- Admin UI: `app/(admin)/discounts/`

---

## Discount invariants — never violate these

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
