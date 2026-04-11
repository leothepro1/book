/**
 * Mews API Response Types
 *
 * Internal types for Mews Connector API responses.
 * Never exposed outside the adapter — platform code uses NormalizedBooking.
 * All response types have Zod schemas for runtime validation.
 */

import { z } from "zod";

// ── Reservation ─────────────────────────────────────────────

export const MewsReservationStateSchema = z.enum([
  "Inquired",
  "Confirmed",
  "Started",
  "Processed",
  "Canceled",
  "Optional",
  "Requested",
]);

export type MewsReservationState = z.infer<typeof MewsReservationStateSchema>;

export const MewsPersonCountSchema = z.object({
  AgeCategoryId: z.string(),
  Count: z.number(),
});

export const MewsReservationSchema = z.object({
  Id: z.string(),
  ServiceId: z.string(),
  AccountId: z.string().optional(),
  AccountType: z.enum(["Customer", "Company"]).optional(),
  Number: z.string().optional(),
  State: MewsReservationStateSchema,
  CreatedUtc: z.string(),
  UpdatedUtc: z.string(),
  CancelledUtc: z.string().nullable().optional(),
  // getAll returns ScheduledStartUtc/ScheduledEndUtc; add returns StartUtc/EndUtc
  ScheduledStartUtc: z.string().optional(),
  ScheduledEndUtc: z.string().optional(),
  StartUtc: z.string().optional(),
  EndUtc: z.string().optional(),
  ActualStartUtc: z.string().nullable().optional(),
  ActualEndUtc: z.string().nullable().optional(),
  AssignedResourceId: z.string().nullable().optional(),
  AssignedSpaceId: z.string().nullable().optional(),
  PersonCounts: z.array(MewsPersonCountSchema).optional(),
  CancellationReason: z.string().nullable().optional(),
  Purpose: z.string().nullable().optional(),
  GroupId: z.string().optional(),
});

export type MewsReservation = z.infer<typeof MewsReservationSchema>;

export const MewsGetReservationsResponseSchema = z.object({
  Reservations: z.array(MewsReservationSchema),
  Cursor: z.string().nullable().optional(),
});

export type MewsGetReservationsResponse = z.infer<typeof MewsGetReservationsResponseSchema>;

// ── Customer ────────────────────────────────────────────────

export const MewsAddressSchema = z.object({
  Line1: z.string().nullable().optional(),
  Line2: z.string().nullable().optional(),
  City: z.string().nullable().optional(),
  PostalCode: z.string().nullable().optional(),
  CountryCode: z.string().nullable().optional(),
}).nullable().optional();

export const MewsCustomerSchema = z.object({
  Id: z.string(),
  FirstName: z.string().nullable().optional(),
  LastName: z.string().nullable().optional(),
  Email: z.string().nullable().optional(),
  Phone: z.string().nullable().optional(),
  Address: MewsAddressSchema,
});

export type MewsCustomer = z.infer<typeof MewsCustomerSchema>;

export const MewsGetCustomersResponseSchema = z.object({
  Customers: z.array(MewsCustomerSchema),
  Cursor: z.string().nullable().optional(),
});

export type MewsGetCustomersResponse = z.infer<typeof MewsGetCustomersResponseSchema>;

// ── Resource (Room/Space) ───────────────────────────────────

export const MewsResourceSchema = z.object({
  Id: z.string(),
  Name: z.string().nullable().optional(),
  State: z.string().optional(),
  IsActive: z.boolean().optional(),
});

// ── Resource Category Assignment (links Resource → ResourceCategory) ──

export const MewsResourceCategoryAssignmentSchema = z.object({
  Id: z.string(),
  IsActive: z.boolean().optional(),
  ResourceId: z.string(),
  CategoryId: z.string(),
});

export type MewsResourceCategoryAssignment = z.infer<typeof MewsResourceCategoryAssignmentSchema>;

export type MewsResource = z.infer<typeof MewsResourceSchema>;

export const MewsGetResourcesResponseSchema = z.object({
  Resources: z.array(MewsResourceSchema),
  ResourceCategoryAssignments: z.array(MewsResourceCategoryAssignmentSchema).optional(),
  Cursor: z.string().nullable().optional(),
});

export type MewsGetResourcesResponse = z.infer<typeof MewsGetResourcesResponseSchema>;

// ── Resource Block (Out of Order / Out of Use) ─────────────

export const MewsResourceBlockSchema = z.object({
  Id: z.string(),
  ResourceId: z.string(),
  StartUtc: z.string(),
  EndUtc: z.string(),
  Type: z.string().optional(),
  IsActive: z.boolean().optional(),
});

export type MewsResourceBlock = z.infer<typeof MewsResourceBlockSchema>;

export const MewsGetResourceBlocksResponseSchema = z.object({
  ResourceBlocks: z.array(MewsResourceBlockSchema),
  Cursor: z.string().nullable().optional(),
});

export type MewsGetResourceBlocksResponse = z.infer<typeof MewsGetResourceBlocksResponseSchema>;

// ── Service ─────────────────────────────────────────────────

export const MewsServiceSchema = z.object({
  Id: z.string(),
  EnterpriseId: z.string(),
  IsActive: z.boolean(),
  Type: z.string().optional(),
});

export type MewsService = z.infer<typeof MewsServiceSchema>;

export const MewsGetServicesResponseSchema = z.object({
  Services: z.array(MewsServiceSchema),
});

export type MewsGetServicesResponse = z.infer<typeof MewsGetServicesResponseSchema>;

// ── Localized String (Mews multi-culture text) ─────────────

export const MewsLocalizedStringSchema = z.record(z.string(), z.string());

// ── Resource Category (Room Type) ──────────────────────────

export const MewsResourceCategorySchema = z.object({
  Id: z.string(),
  Names: MewsLocalizedStringSchema.optional().nullable(),
  ShortDescriptions: MewsLocalizedStringSchema.optional().nullable(),
  Descriptions: MewsLocalizedStringSchema.optional().nullable(),
  Capacity: z.number().optional().nullable(),
  Classification: z.string().optional().nullable(),
  ImageIds: z.array(z.string()).optional().nullable(),
  IsActive: z.boolean().optional(),
  Ordering: z.number().optional().nullable(),
});

export type MewsResourceCategory = z.infer<typeof MewsResourceCategorySchema>;

export const MewsGetResourceCategoriesResponseSchema = z.object({
  ResourceCategories: z.array(MewsResourceCategorySchema),
});

export type MewsGetResourceCategoriesResponse = z.infer<typeof MewsGetResourceCategoriesResponseSchema>;

// ── File (for image URLs) ──────────────────────────────────

export const MewsFileSchema = z.object({
  Id: z.string(),
  Url: z.string(),
});

export type MewsFile = z.infer<typeof MewsFileSchema>;

export const MewsGetFilesResponseSchema = z.object({
  Files: z.array(MewsFileSchema),
});

export type MewsGetFilesResponse = z.infer<typeof MewsGetFilesResponseSchema>;

// ── Rate ────────────────────────────────────────────────────

export const MewsAmountSchema = z.object({
  Currency: z.string(),
  GrossValue: z.number(),
  NetValue: z.number().optional(),
});

export const MewsBaseRatePricingSchema = z.object({
  Amount: MewsAmountSchema.optional().nullable(),
});

export const MewsRatePricingInlineSchema = z.object({
  Discriminator: z.string().optional(),
  BaseRatePricing: MewsBaseRatePricingSchema.optional().nullable(),
  DependentRatePricing: z.unknown().optional().nullable(),
});

export const MewsRateSchema = z.object({
  Id: z.string(),
  ServiceId: z.string(),
  IsActive: z.boolean(),
  IsEnabled: z.boolean(),
  IsPublic: z.boolean(),
  IsBaseRate: z.boolean().optional(),
  BaseRateId: z.string().optional().nullable(),
  Names: MewsLocalizedStringSchema.optional().nullable(),
  ShortDescriptions: MewsLocalizedStringSchema.optional().nullable(),
  Description: MewsLocalizedStringSchema.optional().nullable(),
  Pricing: MewsRatePricingInlineSchema.optional().nullable(),
});

export type MewsRate = z.infer<typeof MewsRateSchema>;

export const MewsGetRatesResponseSchema = z.object({
  Rates: z.array(MewsRateSchema),
});

export type MewsGetRatesResponse = z.infer<typeof MewsGetRatesResponseSchema>;

// ── Rate Pricing ────────────────────────────────────────────

export const MewsCurrencyValueSchema = z.object({
  Currency: z.string(),
  Value: z.number().nullable(),
});

export const MewsResourceCategoryPricingSchema = z.object({
  ResourceCategoryId: z.string(),
  Prices: z.array(MewsCurrencyValueSchema),
});

export const MewsRatePricingSchema = z.object({
  RateId: z.string(),
  ResourceCategoryPrices: z.array(MewsResourceCategoryPricingSchema),
});

export const MewsGetRatePricingResponseSchema = z.object({
  RatePrices: z.array(MewsRatePricingSchema),
});

export type MewsGetRatePricingResponse = z.infer<typeof MewsGetRatePricingResponseSchema>;

// ── Service Availability ────────────────────────────────────

export const MewsCategoryAvailabilitySchema = z.object({
  CategoryId: z.string(),
  Availabilities: z.array(z.number()),
});

export const MewsGetServiceAvailabilityResponseSchema = z.object({
  CategoryAvailabilities: z.array(MewsCategoryAvailabilitySchema),
});

export type MewsGetServiceAvailabilityResponse = z.infer<typeof MewsGetServiceAvailabilityResponseSchema>;

// ── Age Category ────────────────────────────────────────────

export const MewsAgeCategorySchema = z.object({
  Id: z.string(),
  Classification: z.string().optional().nullable(),
  Names: MewsLocalizedStringSchema.optional().nullable(),
});

export type MewsAgeCategory = z.infer<typeof MewsAgeCategorySchema>;

export const MewsGetAgeCategoriesResponseSchema = z.object({
  AgeCategories: z.array(MewsAgeCategorySchema),
});

export type MewsGetAgeCategoriesResponse = z.infer<typeof MewsGetAgeCategoriesResponseSchema>;

// ── Customer Add Response ───────────────────────────────────

export const MewsCustomerAddResponseSchema = z.object({
  Id: z.string(),
  FirstName: z.string().nullable().optional(),
  LastName: z.string().nullable().optional(),
  Email: z.string().nullable().optional(),
});

export type MewsCustomerAddResponse = z.infer<typeof MewsCustomerAddResponseSchema>;

// ── Reservation Add Response ────────────────────────────────

export const MewsReservationAddItemSchema = z.object({
  Identifier: z.string().nullable().optional(),
  Reservation: MewsReservationSchema,
});

export const MewsReservationAddResponseSchema = z.object({
  Reservations: z.array(MewsReservationAddItemSchema),
});

export type MewsReservationAddResponse = z.infer<typeof MewsReservationAddResponseSchema>;

// ── Reservation Update Response ─────────────────────────────

export const MewsReservationUpdateResponseSchema = z.object({
  Reservations: z.array(MewsReservationSchema),
});

export type MewsReservationUpdateResponse = z.infer<typeof MewsReservationUpdateResponseSchema>;

// ── Order Items (revenue items on a reservation) ───────────

export const MewsOrderItemSchema = z.object({
  Id: z.string(),
  ServiceOrderId: z.string().optional().nullable(),
  Amount: z.object({
    Currency: z.string(),
    GrossValue: z.number().optional().nullable(),
    NetValue: z.number().optional().nullable(),
  }).optional().nullable(),
});

export type MewsOrderItem = z.infer<typeof MewsOrderItemSchema>;

export const MewsGetOrderItemsResponseSchema = z.object({
  OrderItems: z.array(MewsOrderItemSchema),
  Cursor: z.string().optional().nullable(),
});

export type MewsGetOrderItemsResponse = z.infer<typeof MewsGetOrderItemsResponseSchema>;

// ── Webhook Payload ─────────────────────────────────────────

export const MewsWebhookEventSchema = z.object({
  Discriminator: z.string(),
  Value: z.object({
    Id: z.string(),
  }),
});

export const MewsWebhookPayloadSchema = z.object({
  EnterpriseId: z.string(),
  IntegrationId: z.string().optional(),
  Events: z.array(MewsWebhookEventSchema),
});

export type MewsWebhookPayload = z.infer<typeof MewsWebhookPayloadSchema>;
