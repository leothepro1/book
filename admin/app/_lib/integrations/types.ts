/**
 * PMS Integration Layer — Normalized Data Contracts
 *
 * These types define the platform's canonical data shapes.
 * Every PMS adapter maps its response into these contracts.
 * No platform code ever sees raw PMS data — only these types.
 *
 * All types have companion Zod schemas for runtime validation.
 */

import { z } from "zod";
import type { Booking, BookingStatus as PrismaBookingStatus } from "@prisma/client";

// ── PMS Provider ────────────────────────────────────────────

export const PmsProviderSchema = z.enum(["manual", "mews", "apaleo", "opera", "fake"]);
export type PmsProvider = z.infer<typeof PmsProviderSchema>;

// ── Integration Status ──────────────────────────────────────

export const IntegrationStatusSchema = z.enum(["active", "disconnected", "error", "pending"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

// ── Normalized Booking ──────────────────────────────────────

export const NormalizedBookingStatusSchema = z.enum(["upcoming", "active", "completed", "cancelled"]);
export type NormalizedBookingStatus = z.infer<typeof NormalizedBookingStatusSchema>;

export const NormalizedBookingSchema = z.object({
  externalId: z.string(),
  tenantId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  guestName: z.string(),
  guestEmail: z.string(),
  guestPhone: z.string().nullable(),
  arrival: z.coerce.date(),
  departure: z.coerce.date(),
  unit: z.string(),
  unitType: z.string().nullable(),
  status: NormalizedBookingStatusSchema,
  adults: z.number(),
  children: z.number(),
  extras: z.array(z.string()),
  rawSource: PmsProviderSchema,
  checkedInAt: z.coerce.date().nullable(),
  checkedOutAt: z.coerce.date().nullable(),
  signatureCapturedAt: z.coerce.date().nullable(),
});

export type NormalizedBooking = z.infer<typeof NormalizedBookingSchema>;

// ── Normalized Guest ────────────────────────────────────────

export const NormalizedGuestAddressSchema = z.object({
  street: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

export const NormalizedGuestSchema = z.object({
  externalId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  address: NormalizedGuestAddressSchema,
});

export type NormalizedGuest = z.infer<typeof NormalizedGuestSchema>;

// ── Sync Result ─────────────────────────────────────────────

export const SyncErrorSchema = z.object({
  externalId: z.string(),
  error: z.string(),
  retriable: z.boolean(),
});

export type SyncError = z.infer<typeof SyncErrorSchema>;

export const SyncResultSchema = z.object({
  created: z.number(),
  updated: z.number(),
  cancelled: z.number(),
  errors: z.array(SyncErrorSchema),
  syncedAt: z.coerce.date(),
});

export type SyncResult = z.infer<typeof SyncResultSchema>;

// ── Sync Event Types ────────────────────────────────────────

export const SyncEventTypeSchema = z.enum([
  "booking.created",
  "booking.updated",
  "booking.cancelled",
  "sync.started",
  "sync.completed",
  "sync.failed",
  "connection.tested",
  "connection.failed",
]);

export type SyncEventType = z.infer<typeof SyncEventTypeSchema>;

// ── Sync Job Status ─────────────────────────────────────────

export const SyncJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "dead",
]);

export type SyncJobStatus = z.infer<typeof SyncJobStatusSchema>;

// ── Prisma → Normalized Mapping ─────────────────────────────

export function mapPrismaStatus(status: PrismaBookingStatus): NormalizedBookingStatus {
  switch (status) {
    case "PRE_CHECKIN":
      return "upcoming";
    case "ACTIVE":
      return "active";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
  }
}

/**
 * Convert a Prisma Booking to the platform's normalized booking contract.
 * Used by the ManualAdapter (local DB bookings, no external PMS).
 */
export function mapPrismaBookingToNormalized(booking: Booking): NormalizedBooking {
  return {
    externalId: booking.id,
    tenantId: booking.tenantId,
    firstName: booking.firstName,
    lastName: booking.lastName,
    guestName: `${booking.firstName} ${booking.lastName}`,
    guestEmail: booking.guestEmail,
    guestPhone: booking.phone,
    arrival: booking.arrival,
    departure: booking.departure,
    unit: booking.unit,
    unitType: null,
    status: mapPrismaStatus(booking.status),
    adults: 0,
    children: 0,
    extras: [],
    rawSource: "manual",
    checkedInAt: booking.checkedInAt,
    checkedOutAt: booking.checkedOutAt,
    signatureCapturedAt: booking.signatureCapturedAt,
  };
}

/**
 * Extract NormalizedGuest from a Prisma Booking.
 * Used by the ManualAdapter where guest data is embedded in bookings.
 */
export function mapPrismaBookingToGuest(booking: Booking): NormalizedGuest {
  return {
    externalId: booking.guestEmail,
    firstName: booking.firstName,
    lastName: booking.lastName,
    email: booking.guestEmail,
    phone: booking.phone,
    address: {
      street: booking.street,
      postalCode: booking.postalCode,
      city: booking.city,
      country: booking.country,
    },
  };
}
