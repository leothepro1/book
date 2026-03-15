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
  AccountId: z.string(),
  AccountType: z.enum(["Customer", "Company"]).optional(),
  Number: z.string().optional(),
  State: MewsReservationStateSchema,
  CreatedUtc: z.string(),
  UpdatedUtc: z.string(),
  CancelledUtc: z.string().nullable().optional(),
  ScheduledStartUtc: z.string(),
  ScheduledEndUtc: z.string(),
  ActualStartUtc: z.string().nullable().optional(),
  ActualEndUtc: z.string().nullable().optional(),
  AssignedResourceId: z.string().nullable().optional(),
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
});

export type MewsResource = z.infer<typeof MewsResourceSchema>;

export const MewsGetResourcesResponseSchema = z.object({
  Resources: z.array(MewsResourceSchema),
  Cursor: z.string().nullable().optional(),
});

export type MewsGetResourcesResponse = z.infer<typeof MewsGetResourcesResponseSchema>;

// ── Service ─────────────────────────────────────────────────

export const MewsServiceSchema = z.object({
  Id: z.string(),
  EnterpriseId: z.string(),
  IsActive: z.boolean(),
});

export type MewsService = z.infer<typeof MewsServiceSchema>;

export const MewsGetServicesResponseSchema = z.object({
  Services: z.array(MewsServiceSchema),
});

export type MewsGetServicesResponse = z.infer<typeof MewsGetServicesResponseSchema>;

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
