# Product catalog — complete data model

Shopify-grade product infrastructure. Full CRUD with variants, options,
inventory tracking, price history, collections, and tags. All operations
are tenant-scoped and admin-gated.

---

## Product model

Product is the core catalog entity. Fields:

  title, slug (auto-generated, unique per tenant, Swedish-normalized)
  description (max 10000), status (ACTIVE/DRAFT/ARCHIVED)
  price (base, in smallest currency unit — ören for SEK, e.g. 12900 = 129 kr)
  currency (default "SEK"), compareAtPrice (strikethrough price, must be > price)
  taxable (boolean), trackInventory, inventoryQuantity, continueSellingWhenOutOfStock
  version (optimistic locking — every update increments, rejects stale writes)
  sortOrder, archivedAt (soft delete timestamp)

---

## Product media

ProductMedia — images and videos attached to a product.
Fields: url, type (image|video), alt, filename, width, height, sortOrder.
DnD reordering via MediaLibrary component.

---

## Options and variants (Shopify model)

ProductOption — axis of variation (e.g. "Tid", "Storlek", "Typ").
  name + values (JSON array). Max 3 options per product, max 100 values each.

ProductVariant — specific combination of option values.
  option1/option2/option3 (positional, nullable), imageUrl, price (override),
  compareAtPrice, sku, trackInventory, inventoryQuantity,
  continueSellingWhenOutOfStock, version, sortOrder.

**Price resolution:** variant.price > 0 → use variant price, else inherit product.price.
`effectivePrice(productPrice, variantPrice)` is the ONLY entry point.
`formatPriceDisplay()` handles currency formatting (12900 → "129" for SEK).

---

## Collections (produktserier)

ProductCollection — groups of products with many-to-many relationship.
Fields: title, slug, description, imageUrl, status (ACTIVE/DRAFT), version, sortOrder.

ProductCollectionItem — join table with sortOrder per membership.
A product can belong to multiple collections. Each membership has independent sort order.
DnD reordering in admin UI.

---

## Tags

ProductTag — global tag registry per tenant (normalized lowercase).
ProductTagItem — many-to-many join. Tags are searchable, filterable.

---

## Inventory system

Optional per product OR per variant (when variants exist).

**Append-only ledger:** InventoryChange tracks every quantity change.
  quantityDelta (signed), quantityAfter (denormalized), reason, note, actorUserId.

  Reasons: PURCHASE, MANUAL_ADJUSTMENT, RETURN, RESERVATION,
           RESERVATION_RELEASED, INITIAL.

Reservation flow: reserve() → purchase (consume stock) or expire (release stock).
continueSellingWhenOutOfStock allows overselling when stock = 0.

---

## Price audit trail

**Append-only ledger:** PriceChange tracks every price modification.
  previousPrice, newPrice, currency, actorUserId, createdAt.

---

## Enterprise features

1. **Optimistic locking** — Product.version, Collection.version, Variant.version.
   updateProduct rejects with code "VERSION_CONFLICT" if expectedVersion mismatches.
2. **Slug uniqueness** — [tenantId, slug] constraint. Auto-generated from title
   with Swedish normalization (å→a, ä→a, ö→o). Collision resolution with suffix.
3. **Soft delete** — ARCHIVED status + archivedAt. Hidden from storefront, data preserved.
   restoreProduct() to unarchive.
4. **Variant validation** — every variant must have values for all options. No duplicates.

---

## Guest-facing product rendering (current state)

Products displayed via section renderers — NOT individual product pages:
  CollectionGridRenderer — 2-column CSS grid, configurable aspect ratio
  ProductHeroRenderer — full-width image + heading + text + buttons
  ProductHeroSplitRenderer — split layout
  CollectionGridV2Renderer — newer variant

**Currently display-only.** No variant selection UI, no "add to cart" button.
Products are manually curated into sections by admins via the visual editor.

---

## Key files

- Types + validation: `app/_lib/products/types.ts`
- Server actions: `app/_lib/products/actions.ts`
- Inventory logic: `app/_lib/products/inventory.ts`
- Pricing logic: `app/_lib/products/pricing.ts`
- Admin UI: `app/(admin)/products/`, `app/(admin)/collections/`
- Guest renderers: `app/(guest)/_components/sections/renderers/`
