# Tenant-isolation audit — discounts

**Domain agent:** `Audit discounts tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

Discount, DiscountCode, DiscountAllocation, DiscountCondition,
DiscountEvent, DiscountProduct, DiscountCollection, DiscountCustomer,
DiscountSegment, DiscountUsage.

## Summary

**~56 call-sites. 100% SAFE in direct prisma-query classification.**

> **Caveat:** The domain agent classified all 56 direct calls as
> SAFE. However, payments and guests agents independently flagged one
> helper function that queries DiscountUsage without tenantId:
> `_lib/discounts/engine.ts:92` (`hasCustomerUsedDiscount`). It is
> tracked as **H2 in the main report** and requires a defense-in-
> depth fix. Runtime behavior is safe because `discountId` FK-scopes
> to one tenant, but explicit tenantId is the right pattern.

## Key findings

### ✅ Compound unique on DiscountCode

`[tenantId, code]` — every code lookup uses
`findUnique({ where: { tenantId_code: { tenantId, code } } })`. No
raw code lookup without tenantId possible in the type system.

### ✅ Code normalization

`normalizeCode(raw) = raw.trim().toUpperCase()` is consistently
applied at every lookup site. No stale-case collisions.

### ✅ Atomic usage-count increments via raw SQL

Three `$executeRaw` call-sites in `applyDiscountInTx`:
- Discount.usageCount via `SET usageCount = usageCount + 1`
- DiscountCode.usageCount via same
- Both inside `$transaction` with `SELECT ... FOR UPDATE` row lock

No `prisma.discount.update({ data: { usageCount: { increment: 1 } } })`
exists outside `apply.ts` — confirmed via grep. This preserves the
CLAUDE.md invariant.

### ✅ `applyDiscountInTx` is transaction-only

Type signature requires `PrismaTransactionClient`. Cannot be called
outside a transaction. Enforced at compile time.

### ✅ Sole eligibility authority

Per CLAUDE.md: `evaluateDiscountCode()` and
`evaluateAutomaticDiscount()` are the ONLY eligibility functions.
Grep confirmed: no route implements custom eligibility logic.

### ✅ `DiscountUsage.orderId` unique

Upsert on orderId is idempotent. orderId is tenant-scoped upstream,
so no cross-tenant collision possible.

### ⚠️ Minor: raw-SQL discount updates by id (apply.ts + release.ts)

5 raw-SQL call-sites update Discount/DiscountCode by id without
`AND tenantId = X` in the WHERE. Safe because caller validates
ownership before the transaction. Defense-in-depth fix available:
add the tenantId clause to the raw SQL. Sprint-2 priority.

## Per-model classification

| Model | SAFE | AMBIGUOUS | UNSAFE |
|---|---|---|---|
| Discount | 16 | 0 | 0 |
| DiscountCode | 14 | 0 | 0 |
| DiscountCondition | 7 | 0 | 0 |
| DiscountEvent | 10 | 0 | 0 |
| DiscountUsage | 5 (+1 flagged by cross-domain) | 0 | 0 |
| DiscountProduct | 2 | 0 | 0 |
| DiscountCollection | 2 | 0 | 0 |
| DiscountSegment | 2 | 0 | 0 |
| DiscountCustomer | 2 | 0 | 0 |
| DiscountAllocation | 3 | 0 | 0 |

## Recommended fixes

- **H2** (main report): Add tenantId to `hasCustomerUsedDiscount`
  query in `engine.ts:92` — 15 min, sprint 1
- **Raw-SQL defense-in-depth**: Add `AND "tenantId" = ${tenantId}`
  to 5 raw `UPDATE` / `SELECT FOR UPDATE` sites in
  `apply.ts:120, 211, 220` and `release.ts:39, 47`. Sprint 2.
