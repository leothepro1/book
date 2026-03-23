/**
 * Product Types & Validation Schemas
 * ═══════════════════════════════════
 * Canonical types for the product catalog.
 * All input validation uses these Zod schemas.
 * All server actions accept/return these types.
 *
 * Shopify parity:
 *   - Product with title, description, status, price, inventory, tax
 *   - Options (up to 3 axes of variation)
 *   - Variants (combinatorial — each with own price + inventory)
 *   - Media (images + video, ordered)
 *   - Collections (many-to-many with sort order)
 *   - Optimistic locking (version field prevents concurrent overwrites)
 *   - Soft delete (ARCHIVED status, archivedAt timestamp)
 *   - Inventory ledger (append-only audit trail)
 *   - Price history (append-only audit trail)
 *   - Inventory reservations (cart soft locks)
 */

import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────

export const ProductStatusSchema = z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const InventoryChangeReasonSchema = z.enum([
  "PURCHASE",
  "MANUAL_ADJUSTMENT",
  "RETURN",
  "RESERVATION",
  "RESERVATION_RELEASED",
  "INITIAL",
]);
export type InventoryChangeReason = z.infer<typeof InventoryChangeReasonSchema>;

// ── Slug generation ──────────────────────────────────────────

const SWEDISH_MAP: Record<string, string> = { å: "a", ä: "a", ö: "o", Å: "a", Ä: "a", Ö: "o" };

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åäöÅÄÖ]/g, (c) => SWEDISH_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ── Product Media ────────────────────────────────────────────

export const ProductMediaInputSchema = z.object({
  url: z.string().url(),
  type: z.enum(["image", "video"]).default("image"),
  alt: z.string().default(""),
  filename: z.string().default(""),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

export type ProductMediaInput = z.infer<typeof ProductMediaInputSchema>;

// ── Product Option ───────────────────────────────────────────

export const ProductOptionInputSchema = z.object({
  name: z.string().min(1, "Alternativnamn krävs").max(100),
  values: z.array(z.string().min(1).max(200)).min(1, "Minst ett värde krävs").max(100, "Max 100 värden per alternativ"),
}).refine(
  (o) => new Set(o.values).size === o.values.length,
  { message: "Duplicerade alternativvärden tillåts inte" },
);

export type ProductOptionInput = z.infer<typeof ProductOptionInputSchema>;

// ── Product Variant ──────────────────────────────────────────

export const ProductVariantInputSchema = z.object({
  option1: z.string().nullable().optional(),
  option2: z.string().nullable().optional(),
  option3: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  price: z.number().int().min(0, "Pris kan inte vara negativt"),
  compareAtPrice: z.number().int().min(0).nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  trackInventory: z.boolean().default(false),
  inventoryQuantity: z.number().int().min(0).default(0),
  continueSellingWhenOutOfStock: z.boolean().default(false),
}).refine(
  (v) => !v.compareAtPrice || v.compareAtPrice > v.price,
  { message: "Jämförpris måste vara högre än variantpriset", path: ["compareAtPrice"] },
);

export type ProductVariantInput = z.infer<typeof ProductVariantInputSchema>;

// ── Variant validation ───────────────────────────────────────

/**
 * Validate that every variant has option values matching the product's options.
 * Returns an error message or null if valid.
 *
 * Rules:
 *   - Each variant must have exactly one value per option
 *   - Each value must be one of the option's allowed values
 *   - No duplicate variant combinations
 */
export function validateVariantsAgainstOptions(
  options: ProductOptionInput[],
  variants: ProductVariantInput[],
): string | null {
  if (options.length === 0 && variants.length > 0) {
    return "Varianter kräver minst ett alternativ";
  }

  const optionKeys = ["option1", "option2", "option3"] as const;
  const seen = new Set<string>();

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi]!;
    const combo: string[] = [];

    for (let oi = 0; oi < options.length; oi++) {
      const key = optionKeys[oi]!;
      const value = v[key];
      const option = options[oi]!;

      if (!value) {
        return `Variant ${vi + 1}: saknar värde för "${option.name}"`;
      }

      const allowedValues = option.values;
      if (!allowedValues.includes(value)) {
        return `Variant ${vi + 1}: "${value}" är inte ett giltigt värde för "${option.name}"`;
      }

      combo.push(value);
    }

    // Check no value set for non-existent options
    for (let oi = options.length; oi < 3; oi++) {
      const key = optionKeys[oi]!;
      if (v[key]) {
        return `Variant ${vi + 1}: har värde för alternativ ${oi + 1} som inte finns`;
      }
    }

    const comboKey = combo.join("|||");
    if (seen.has(comboKey)) {
      return `Duplicerad variant: ${combo.join(" / ")}`;
    }
    seen.add(comboKey);
  }

  // Check for duplicate SKUs (non-empty only)
  const skuSet = new Set<string>();
  for (let vi = 0; vi < variants.length; vi++) {
    const sku = variants[vi]?.sku;
    if (sku && sku.trim()) {
      const normalized = sku.trim().toLowerCase();
      if (skuSet.has(normalized)) {
        return `Duplicerad SKU: "${sku.trim()}"`;
      }
      skuSet.add(normalized);
    }
  }

  return null;
}

// ── Product Create ───────────────────────────────────────────

export const MAX_OPTIONS = 10;

export const CreateProductSchema = z.object({
  title: z.string().min(1, "Titel krävs").max(255),
  description: z.string().max(10000).default(""),
  status: ProductStatusSchema.default("DRAFT"),
  price: z.number().int().min(0, "Pris kan inte vara negativt").default(0),
  currency: z.string().length(3).default("SEK"),
  compareAtPrice: z.number().int().min(0).nullable().optional(),
  taxable: z.boolean().default(true),
  trackInventory: z.boolean().default(false),
  inventoryQuantity: z.number().int().min(0).default(0),
  continueSellingWhenOutOfStock: z.boolean().default(false),
  media: z.array(ProductMediaInputSchema).default([]),
  options: z.array(ProductOptionInputSchema).max(MAX_OPTIONS, `Max ${MAX_OPTIONS} alternativ`).default([]),
  variants: z.array(ProductVariantInputSchema).default([]),
  collectionIds: z.array(z.string()).default([]),
  tags: z.array(z.string().min(1).max(100)).default([]),
}).refine(
  (d) => !d.compareAtPrice || d.compareAtPrice > d.price,
  { message: "Jämförpris måste vara högre än priset", path: ["compareAtPrice"] },
);

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// ── Product Update ───────────────────────────────────────────

export const UpdateProductSchema = z.object({
  /** Required for optimistic locking — must match current version. */
  expectedVersion: z.number().int().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  status: ProductStatusSchema.optional(),
  price: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  compareAtPrice: z.number().int().min(0).nullable().optional(),
  taxable: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  inventoryQuantity: z.number().int().min(0).optional(),
  continueSellingWhenOutOfStock: z.boolean().optional(),
  media: z.array(ProductMediaInputSchema).optional(),
  options: z.array(ProductOptionInputSchema).max(MAX_OPTIONS).optional(),
  variants: z.array(ProductVariantInputSchema).optional(),
  collectionIds: z.array(z.string()).optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
}).refine(
  (d) => {
    if (d.compareAtPrice === undefined || d.compareAtPrice === null) return true;
    if (d.price === undefined) return true;
    return d.compareAtPrice > d.price;
  },
  { message: "Jämförpris måste vara högre än priset", path: ["compareAtPrice"] },
);

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

// ── Inventory adjustment ─────────────────────────────────────

export const AdjustInventorySchema = z.object({
  productId: z.string(),
  variantId: z.string().nullable().optional(),
  /** Signed delta: positive = add stock, negative = remove stock. */
  quantityDelta: z.number().int(),
  reason: InventoryChangeReasonSchema,
  note: z.string().max(500).optional(),
  /** Reference ID (e.g. order ID) */
  referenceId: z.string().optional(),
});

export type AdjustInventoryInput = z.infer<typeof AdjustInventorySchema>;

// ── Collection Create/Update ─────────────────────────────────

export const CreateCollectionSchema = z.object({
  title: z.string().min(1, "Titel krävs").max(255),
  description: z.string().max(10000).default(""),
  imageUrl: z.string().url().nullable().optional(),
  status: ProductStatusSchema.default("DRAFT"),
  productIds: z.array(z.string()).default([]),
});

export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;

export const UpdateCollectionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  status: ProductStatusSchema.optional(),
  productIds: z.array(z.string()).optional(),
});

export type UpdateCollectionInput = z.infer<typeof UpdateCollectionSchema>;
