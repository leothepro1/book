/**
 * Product Catalog — Public API
 *
 * All product operations go through this barrel export.
 * Server actions for CRUD, inventory service, types for validation.
 */

// CRUD
export {
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  getProduct,
  listProducts,
  searchProducts,
  getInventoryHistory,
  getPriceHistory,
  createCollection,
  updateCollection,
  deleteCollection,
  listCollections,
} from "./actions";

// Inventory
export {
  adjustInventory,
  reserveInventory,
  releaseExpiredReservations,
} from "./inventory";

// Pricing
export {
  effectivePrice,
  hasVariantPriceOverride,
  formatPriceDisplay,
  getVariantPriceRange,
} from "./pricing";

// Types & schemas
export {
  CreateProductSchema,
  UpdateProductSchema,
  CreateCollectionSchema,
  UpdateCollectionSchema,
  AdjustInventorySchema,
  ProductStatusSchema,
  InventoryChangeReasonSchema,
  ProductMediaInputSchema,
  ProductOptionInputSchema,
  ProductVariantInputSchema,
  titleToSlug,
  validateVariantsAgainstOptions,
  MAX_OPTIONS,
} from "./types";

export type {
  CreateProductInput,
  UpdateProductInput,
  CreateCollectionInput,
  UpdateCollectionInput,
  AdjustInventoryInput,
  ProductStatus,
  InventoryChangeReason,
  ProductMediaInput,
  ProductOptionInput,
  ProductVariantInput,
} from "./types";
