/**
 * Companies (B2B "Företag") — Types & Validation Schemas.
 *
 * Zod schemas are the canonical shape for every service boundary. Prisma
 * types are re-exported for ergonomic imports elsewhere.
 *
 * FAS 5.5: 3-layer contact model.
 *   Company ← CompanyContact ← CompanyLocationAccess → CompanyLocation
 *   ContactRole enum + ROLE_PERMISSIONS are removed — every contact that
 *   has access to a location has full privileges at that location. Future
 *   per-contact roles will arrive as a nullable `roleId` column on
 *   CompanyContact, not as a rigid enum.
 */

import { z } from "zod";
import type {
  Company,
  CompanyContact,
  CompanyLocation,
  CompanyLocationAccess,
  PaymentTerms,
  CompanyStatus,
  TaxSetting,
  CheckoutMode,
  PaymentTermsType,
  Catalog,
  CatalogFixedPrice,
  CatalogInclusion,
  CatalogQuantityRule,
  CompanyLocationCatalog,
  CatalogStatus,
} from "@prisma/client";

export type {
  Company,
  CompanyContact,
  CompanyLocation,
  CompanyLocationAccess,
  PaymentTerms,
  CompanyStatus,
  TaxSetting,
  CheckoutMode,
  PaymentTermsType,
  Catalog,
  CatalogFixedPrice,
  CatalogInclusion,
  CatalogQuantityRule,
  CompanyLocationCatalog,
  CatalogStatus,
};

// ── Shared ──────────────────────────────────────────────────────

export const CheckoutModeSchema = z.enum(["AUTO_SUBMIT", "DRAFT_FOR_REVIEW"]);
export const TaxSettingSchema = z.enum([
  "COLLECT",
  "EXEMPT",
  "COLLECT_UNLESS_EXEMPT",
]);
export const PaymentTermsTypeSchema = z.enum([
  "DUE_ON_RECEIPT",
  "DUE_ON_FULFILLMENT",
  "NET",
  "FIXED_DATE",
]);

/** Billing/shipping address blob. Kept intentionally loose — validation is the
 *  responsibility of the checkout/admin UI layer that owns the address form. */
export const AddressJsonSchema = z
  .object({
    name: z.string().optional(),
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough();

// ── Email normalization ─────────────────────────────────────────

/** Email input: trim + lowercase BEFORE validation so that user-entered values
 *  like " Boss@Acme.SE " pass `.email()` and match the DB's normalized form. */
const EmailInputSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email());

// ── Company ─────────────────────────────────────────────────────

/**
 * Main-contact payload on createCompany. Either reference an existing
 * GuestAccount by id, or invite/promote a new one by email+name. No role —
 * the 3-layer model treats contact access as a simple yes/no grant per
 * location.
 */
export const CreateCompanyMainContactSchema = z.union([
  z.object({
    guestAccountId: z.string().min(1),
    title: z.string().max(200).optional(),
    locale: z.string().max(20).optional(),
  }),
  z.object({
    newGuestEmail: EmailInputSchema,
    newGuestName: z.string().min(1).max(200),
    title: z.string().max(200).optional(),
    locale: z.string().max(20).optional(),
  }),
]);
export type CreateCompanyMainContact = z.infer<
  typeof CreateCompanyMainContactSchema
>;

export const CreateCompanyFirstLocationSchema = z.object({
  name: z.string().min(1).max(200),
  billingAddress: AddressJsonSchema,
  shippingAddress: AddressJsonSchema.optional(),
  externalId: z.string().max(200).optional(),
});
export type CreateCompanyFirstLocation = z.infer<
  typeof CreateCompanyFirstLocationSchema
>;

export const CreateCompanyInputSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  externalId: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  note: z.string().max(5000).optional(),
  firstLocation: CreateCompanyFirstLocationSchema,
  mainContact: CreateCompanyMainContactSchema,
});
export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;

export const UpdateCompanyPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  externalId: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  note: z.string().max(5000).nullable().optional(),
  metafields: z.unknown().optional(),
});
export type UpdateCompanyPatch = z.infer<typeof UpdateCompanyPatchSchema>;

export const ListCompaniesInputSchema = z.object({
  tenantId: z.string().min(1),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  orderingApproved: z.boolean().optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(200).default(50),
});
export type ListCompaniesInput = z.infer<typeof ListCompaniesInputSchema>;

// ── Company Location ────────────────────────────────────────────

export const CreateLocationInputSchema = z.object({
  tenantId: z.string().min(1),
  companyId: z.string().min(1),
  name: z.string().min(1).max(200),
  billingAddress: AddressJsonSchema,
  shippingAddress: AddressJsonSchema.optional(),
  externalId: z.string().max(200).optional(),
  paymentTermsId: z.string().optional(),
  depositPercent: z.number().int().min(0).max(100).optional(),
  creditLimitCents: z.bigint().nonnegative().optional(),
  checkoutMode: CheckoutModeSchema.optional(),
  taxSetting: TaxSettingSchema.optional(),
  taxId: z.string().max(200).optional(),
});
export type CreateLocationInput = z.infer<typeof CreateLocationInputSchema>;

export const UpdateLocationPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  billingAddress: AddressJsonSchema.optional(),
  shippingAddress: AddressJsonSchema.nullable().optional(),
  externalId: z.string().max(200).nullable().optional(),
  paymentTermsId: z.string().nullable().optional(),
  depositPercent: z.number().int().min(0).max(100).optional(),
  creditLimitCents: z.bigint().nonnegative().nullable().optional(),
  checkoutMode: CheckoutModeSchema.optional(),
  taxSetting: TaxSettingSchema.optional(),
  taxId: z.string().max(200).nullable().optional(),
  taxIdValidated: z.boolean().optional(),
  taxExemptions: z.array(z.string().max(100)).max(50).optional(),
  allowOneTimeShippingAddress: z.boolean().optional(),
  metafields: z.unknown().optional(),
});
export type UpdateLocationPatch = z.infer<typeof UpdateLocationPatchSchema>;

// ── Contacts (3-layer) ──────────────────────────────────────────

/**
 * Create a CompanyContact for an existing or new GuestAccount. Optional
 * initial set of location ids to grant access to — caller can also call
 * grantAccess afterwards.
 */
export const CreateContactInputSchema = z.object({
  tenantId: z.string().min(1),
  companyId: z.string().min(1),
  contact: z.union([
    z.object({ guestAccountId: z.string().min(1) }),
    z.object({
      email: EmailInputSchema,
      name: z.string().min(1).max(200),
    }),
  ]),
  title: z.string().max(200).optional(),
  locale: z.string().max(20).optional(),
  isMainContact: z.boolean().optional(),
  grantAccessToLocationIds: z.array(z.string().min(1)).max(500).optional(),
});
export type CreateContactInput = z.infer<typeof CreateContactInputSchema>;

export const UpdateContactPatchSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  locale: z.string().max(20).nullable().optional(),
});
export type UpdateContactPatch = z.infer<typeof UpdateContactPatchSchema>;

// ── Location Access ─────────────────────────────────────────────

export const GrantAccessInputSchema = z.object({
  tenantId: z.string().min(1),
  companyContactId: z.string().min(1),
  companyLocationId: z.string().min(1),
});
export type GrantAccessInput = z.infer<typeof GrantAccessInputSchema>;

// ── Payment Terms ───────────────────────────────────────────────

export const CreateCustomTermInputSchema = z
  .object({
    tenantId: z.string().min(1),
    name: z.string().min(1).max(200),
    type: PaymentTermsTypeSchema,
    netDays: z.number().int().min(1).max(3650).optional(),
    fixedDate: z.date().optional(),
  })
  .refine(
    (t) =>
      t.type !== "NET" || (typeof t.netDays === "number" && t.netDays > 0),
    { message: "NET terms require netDays > 0", path: ["netDays"] },
  )
  .refine(
    (t) => t.type !== "FIXED_DATE" || t.fixedDate instanceof Date,
    { message: "FIXED_DATE terms require fixedDate", path: ["fixedDate"] },
  );
export type CreateCustomTermInput = z.infer<typeof CreateCustomTermInputSchema>;

/**
 * Snapshot shape frozen onto Order.paymentTermsSnapshot at order creation.
 * Stable — service and checkout code both depend on this contract.
 */
export const PaymentTermsSnapshotSchema = z.object({
  termsId: z.string(),
  name: z.string(),
  type: PaymentTermsTypeSchema,
  netDays: z.number().int().nullable(),
  fixedDate: z.string().nullable(), // ISO 8601 for JSON persistence
  snapshotAt: z.string(), // ISO 8601
});
export type PaymentTermsSnapshot = z.infer<typeof PaymentTermsSnapshotSchema>;

// ── Catalog ─────────────────────────────────────────────────────

export const CatalogStatusSchema = z.enum(["ACTIVE", "DRAFT"]);

/**
 * Adjustment percentage. Spec requests -100 to 1000, but the DB column is
 * Decimal(5,2) which maxes at 999.99. The upper bound is clamped here and
 * flagged as tech-debt: raising it requires a migration to Decimal(7,2).
 */
export const AdjustmentPercentSchema = z
  .number()
  .min(-100, "Adjustment may not be less than -100% (would give negative prices)")
  .max(999.99, "Adjustment may not exceed 999.99% (DB column is Decimal(5,2))");

export const CreateCatalogInputSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  status: CatalogStatusSchema.optional(),
  overallAdjustmentPercent: AdjustmentPercentSchema.nullable().optional(),
  includeAllProducts: z.boolean().optional(),
});
export type CreateCatalogInput = z.infer<typeof CreateCatalogInputSchema>;

export const UpdateCatalogPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: CatalogStatusSchema.optional(),
  overallAdjustmentPercent: AdjustmentPercentSchema.nullable().optional(),
  includeAllProducts: z.boolean().optional(),
});
export type UpdateCatalogPatch = z.infer<typeof UpdateCatalogPatchSchema>;

export const ListCatalogsInputSchema = z.object({
  tenantId: z.string().min(1),
  status: CatalogStatusSchema.optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(200).default(50),
});
export type ListCatalogsInput = z.infer<typeof ListCatalogsInputSchema>;

/**
 * Product reference used throughout B2B pricing. Shared by the
 * catalog-mutation API (fixed prices, quantity rules) and the pricing
 * resolver.
 *
 * Variant-only by design (FAS 6.2B): accommodation pricing is
 * PMS-authoritative and never flows through B2B catalogs — see Pass 3
 * Risk #8 and computeAccommodationLinePrice
 * (app/_lib/pricing/line-pricing.ts).
 *
 * The `type: "variant"` discriminator is kept on the object shape even
 * though it's now trivially constant. It gives callers a single uniform
 * shape and leaves room to re-widen if a future product class emerges.
 */
export const ProductRefSchema = z.object({
  type: z.literal("variant"),
  id: z.string().min(1),
});
export type ProductRef = z.infer<typeof ProductRefSchema>;

/**
 * Inclusion reference — 2-way XOR over variant | collection. A catalog
 * inclusion may scope by a single variant id or by a whole collection
 * (everything-in-this-collection pattern). Accommodations are out of
 * scope — see ProductRefSchema.
 */
export const InclusionRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("variant"), id: z.string().min(1) }),
  z.object({ type: z.literal("collection"), id: z.string().min(1) }),
]);
export type InclusionRef = z.infer<typeof InclusionRefSchema>;

export const SetFixedPriceInputSchema = z.object({
  tenantId: z.string().min(1),
  catalogId: z.string().min(1),
  productRef: ProductRefSchema,
  fixedPriceCents: z.bigint().nonnegative(),
});
export type SetFixedPriceInput = z.infer<typeof SetFixedPriceInputSchema>;

/**
 * JSON volume pricing tier. `priceCents` is stringified BigInt because
 * Prisma's Json type cannot hold native BigInt.
 */
export const VolumePricingTierSchema = z.object({
  minQty: z.number().int().min(2, "Tier minQty must be > 1 (tier 1 is 'base')"),
  priceCents: z.string().regex(/^\d+$/, "priceCents must be a non-negative integer string"),
});
export type VolumePricingTier = z.infer<typeof VolumePricingTierSchema>;

export const VolumePricingSchema = z
  .array(VolumePricingTierSchema)
  .max(10, "At most 10 volume tiers per rule (Shopify parity)")
  .refine(
    (tiers) => {
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].minQty <= tiers[i - 1].minQty) return false;
      }
      return true;
    },
    { message: "volumePricing must be sorted strictly ascending by minQty" },
  )
  .refine(
    (tiers) => {
      for (let i = 1; i < tiers.length; i++) {
        if (BigInt(tiers[i].priceCents) >= BigInt(tiers[i - 1].priceCents)) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "priceCents must be strictly decreasing (higher quantity = lower unit price)",
    },
  );

export const SetQuantityRuleInputSchema = z
  .object({
    tenantId: z.string().min(1),
    catalogId: z.string().min(1),
    productRef: ProductRefSchema,
    minQuantity: z.number().int().min(1).nullable().optional(),
    maxQuantity: z.number().int().min(1).nullable().optional(),
    increment: z.number().int().min(1).nullable().optional(),
    volumePricing: VolumePricingSchema.nullable().optional(),
  })
  .refine(
    (r) =>
      r.minQuantity == null ||
      r.maxQuantity == null ||
      r.minQuantity <= r.maxQuantity,
    { message: "minQuantity must be <= maxQuantity", path: ["maxQuantity"] },
  );
export type SetQuantityRuleInput = z.infer<typeof SetQuantityRuleInputSchema>;

export const AddInclusionInputSchema = z.object({
  tenantId: z.string().min(1),
  catalogId: z.string().min(1),
  productRef: InclusionRefSchema,
});
export type AddInclusionInput = z.infer<typeof AddInclusionInputSchema>;

export const AssignCatalogInputSchema = z.object({
  tenantId: z.string().min(1),
  catalogId: z.string().min(1),
  companyLocationId: z.string().min(1),
});
export type AssignCatalogInput = z.infer<typeof AssignCatalogInputSchema>;
