# Tenant-isolation audit — products

**Domain agent:** `Audit products tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

Product, ProductVariant, ProductCollection, ProductCollectionItem,
ProductMedia, ProductOption, ProductTag, ProductTagItem,
ProductTemplate, ProductChannelPublication, PriceChange.

## Summary

**~73 call-sites. 62 SAFE · 8 AMBIGUOUS · 3 UNSAFE (all
defense-in-depth, not live leaks after verification).**

## Key findings

### 🟠 3 delete call-sites missing tenantId in WHERE

All three follow the "verify-then-act" pattern: upstream `findFirst`
with tenantId → then `delete` by id only. Runtime-safe via the
upstream check, but fragile.

| Line | Model | Call |
|---|---|---|
| `_lib/products/actions.ts:574` | Product | `delete({ where: { id: productId } })` |
| `_lib/products/actions.ts:858` | ProductCollection | `delete({ where: { id: collectionId } })` |
| `_lib/products/template-actions.ts:159` | ProductTemplate | `delete({ where: { id } })` |

Same pattern in 4 update call-sites (`actions.ts:334, 515, 540, 1132`).

**Fix:** Add `tenantId` to every delete/update `where`. Prisma
supports this; `P2025` is thrown if tenant mismatch (equivalent to
current "not found" path). Estimated effort: 30 minutes + tests.

See **M1–M7** in main report.

### ✅ Slug-based lookups

Composite unique `[tenantId, slug]` on Product and ProductCollection
means `findUnique({ where: { tenantId_slug: { tenantId, slug } } })`
is impossible without tenantId. Guest-facing routes
(`/shop/products/[slug]`, `/shop/collections/[slug]`) use
`resolveTenantFromHost` first.

### ✅ Tags

`ProductTag` uses compound unique `[tenantId, name]` — prevents
cross-tenant tag-pollution. `ProductTagItem` inherits scope via
productId FK.

### ✅ Nested creation

Complex create-with-variants/options/media operations consistently
use `$transaction`. Tests not audited in this pass.

## Per-model classification

| Model | SAFE | AMBIGUOUS | UNSAFE |
|---|---|---|---|
| Product | heavy | 4 updates | 1 delete |
| ProductVariant | ✅ all | 0 | 0 |
| ProductCollection | heavy | 0 | 1 delete |
| ProductCollectionItem | ✅ all | 0 | 0 |
| ProductMedia | ✅ all | 0 | 0 |
| ProductOption | ✅ all | 0 | 0 |
| ProductTag | ✅ all | 0 | 0 |
| ProductTagItem | ✅ all | 0 | 0 |
| ProductTemplate | heavy | 0 | 1 delete |
| ProductChannelPublication | ✅ all | 0 | 0 |
| PriceChange | ✅ all (explicit tenantId on all) | 0 | 0 |

## Recommended fixes

See main report **M1–M7**: add `tenantId` to every product delete +
update WHERE. Sprint-1 priority.
