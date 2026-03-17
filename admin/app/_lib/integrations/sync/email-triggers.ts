/**
 * Email Triggers for Sync Lifecycle
 * ══════════════════════════════════
 *
 * Maps booking sync events to email notifications.
 * This file is the ONLY place that connects sync to email.
 *
 * Resilience principle (from CLAUDE.md):
 *   "One bad booking never aborts entire sync"
 * Email failures follow the same rule — they are logged and swallowed.
 * A failed email send NEVER throws, NEVER aborts sync, and NEVER
 * affects the booking record.
 */

import { sendEmailEvent } from "@/app/_lib/email";
import { portalSlugToUrl } from "@/app/_lib/tenant/portal-slug";
import type { EmailEventType } from "@/app/_lib/email";
import type { Booking, Tenant } from "@prisma/client";

type BookingWithTenant = Booking & { tenant: Tenant };

// ── Public trigger functions ────────────────────────────────────

export async function triggerBookingConfirmed(
  booking: BookingWithTenant,
): Promise<void> {
  await safeSend("BOOKING_CONFIRMED", booking, {
    guestName: guestFullName(booking),
    hotelName: booking.tenant.name,
    checkIn: formatDate(booking.arrival),
    checkOut: formatDate(booking.departure),
    roomType: booking.unit,
    bookingRef: booking.externalId ?? booking.id,
    portalUrl: portalUrl(booking),
  });
}

export async function triggerCheckInConfirmed(
  booking: BookingWithTenant,
): Promise<void> {
  await safeSend("CHECK_IN_CONFIRMED", booking, {
    guestName: guestFullName(booking),
    hotelName: booking.tenant.name,
    roomNumber: booking.unit,
    checkIn: formatDate(booking.arrival),
    checkOut: formatDate(booking.departure),
    portalUrl: portalUrl(booking),
  });
}

export async function triggerCheckOutConfirmed(
  booking: BookingWithTenant,
): Promise<void> {
  await safeSend("CHECK_OUT_CONFIRMED", booking, {
    guestName: guestFullName(booking),
    hotelName: booking.tenant.name,
    checkOut: formatDate(booking.departure),
  });
}

export async function triggerBookingCancelled(
  booking: BookingWithTenant,
  cancellationReason?: string,
): Promise<void> {
  await safeSend("BOOKING_CANCELLED", booking, {
    guestName: guestFullName(booking),
    hotelName: booking.tenant.name,
    bookingRef: booking.externalId ?? booking.id,
    cancellationReason: cancellationReason ?? "",
  });
}

// ── Private helpers ─────────────────────────────────────────────

/**
 * Wraps sendEmailEvent in try/catch.
 * Email failures NEVER abort sync — they are logged and swallowed.
 */
async function safeSend(
  eventType: EmailEventType,
  booking: BookingWithTenant,
  variables: Record<string, string>,
): Promise<void> {
  if (!booking.guestEmail) return;

  try {
    await sendEmailEvent(
      booking.tenantId,
      eventType,
      booking.guestEmail,
      variables,
    );
  } catch (error) {
    console.error(
      `[email-triggers] Failed to send ${eventType} for booking ${booking.id}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export function guestFullName(booking: Pick<Booking, "firstName" | "lastName">): string {
  const parts = [booking.firstName, booking.lastName].filter(Boolean);
  return parts.join(" ");
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Build the stable guest portal URL on the tenant's subdomain. */
function portalUrl(booking: BookingWithTenant): string {
  if (!booking.portalToken) return "";
  if (!booking.tenant.portalSlug) return "";
  const base = portalSlugToUrl(booking.tenant.portalSlug);
  return `${base}/home/${booking.portalToken}`;
}
