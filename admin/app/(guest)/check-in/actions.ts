"use server";

import { prisma } from "../../_lib/db/prisma";
import { getTenantConfig } from "../_lib/tenant";
import { performCheckIn } from "../_lib/booking/actions";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getActiveCheckinCards } from "@/app/_lib/pages/config";
import { transitionFulfillmentStatus } from "@/app/_lib/orders/fulfillment";
import { log } from "@/app/_lib/logger";
import "@/app/_lib/checkin-cards/definitions";

function norm(s?: string) {
  return (s || "").trim();
}

// ── Types ──────────────────────────────────────────────────

export type CheckInLookupPayload = {
  method: "booking";
  bookingId?: string;
  lastName?: string;
  token?: string;
};

export type CheckInLookupResponse =
  | {
      ok: true;
      booking: {
        id: string;
        firstName: string;
        lastName: string;
        arrivalISO: string;
        departureISO: string;
        unit: string;
        heroImageUrl: string;
        termsUrl: string;
      };
    }
  | { ok: false; message: string };

export type CheckInCommitResponse =
  | { ok: true; already: boolean; nextHref: string }
  | { ok: false; message: string };

// ── Guards ─────────────────────────────────────────────────

/** Resolve tenant from host and verify checkinEnabled. */
async function requireCheckinEnabled(): Promise<
  | { ok: true; tenantId: string }
  | { ok: false; message: string }
> {
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return { ok: false, message: "Portalen kunde inte identifieras." };
  }
  if (!tenant.checkinEnabled) {
    return { ok: false, message: "Incheckning är inte aktiverad." };
  }
  return { ok: true, tenantId: tenant.id };
}

// ── Lookup ─────────────────────────────────────────────────

export async function checkInLookup(payload: CheckInLookupPayload): Promise<CheckInLookupResponse> {
  const guard = await requireCheckinEnabled();
  if (!guard.ok) return guard;

  const bookingId = norm(payload?.bookingId);
  const lastName = norm(payload?.lastName);

  if (!bookingId || !lastName) {
    return { ok: false, message: "Fyll i bokningsnummer och efternamn." };
  }

  // DEV MOCK: booking "1234" + "Test" always works
  if (
    process.env.NODE_ENV === "development" &&
    bookingId === "1234" &&
    lastName.toLowerCase() === "test"
  ) {
    const config = await getTenantConfig(guard.tenantId);
    return {
      ok: true,
      booking: {
        id: "mock-1234",
        firstName: "Test",
        lastName: "Test",
        arrivalISO: new Date("2026-03-05T14:00:00").toISOString(),
        departureISO: new Date("2026-03-08T11:00:00").toISOString(),
        unit: "Strandhus 32",
        heroImageUrl: "",
        termsUrl: config.supportLinks?.termsUrl ?? "",
      },
    };
  }

  // Tenant-scoped booking lookup — never leak cross-tenant data
  const booking = await prisma.booking.findFirst({
    where: {
      tenantId: guard.tenantId,
      id: bookingId,
      lastName: { equals: lastName, mode: "insensitive" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      arrival: true,
      departure: true,
      unit: true,
      tenantId: true,
    },
  });

  if (!booking) {
    return { ok: false, message: "Ingen bokning hittades. Kontrollera bokningsnummer och efternamn." };
  }

  const config = await getTenantConfig(booking.tenantId);
  return {
    ok: true,
    booking: {
      id: booking.id,
      firstName: booking.firstName,
      lastName: booking.lastName,
      arrivalISO: booking.arrival.toISOString(),
      departureISO: booking.departure.toISOString(),
      unit: booking.unit,
      heroImageUrl: "",
      termsUrl: config.supportLinks?.termsUrl ?? "",
    },
  };
}

// ── Commit ─────────────────────────────────────────────────

export async function checkInCommit(payload: {
  bookingId: string;
  cardData: import("@/app/_lib/checkin-cards/types").CheckinCardData;
  token?: string;
  next?: string;
}): Promise<CheckInCommitResponse> {
  const guard = await requireCheckinEnabled();
  if (!guard.ok) return guard;

  const bookingId = norm(payload?.bookingId);
  const token = norm(payload?.token);
  const next = norm(payload?.next);
  const cardData = payload?.cardData ?? {};

  if (!bookingId) return { ok: false, message: "Boknings-ID saknas." };

  // DEV MOCK: skip DB for mock booking
  if (process.env.NODE_ENV === "development" && bookingId === "mock-1234") {
    const nextHref = token ? `/p/${token}` : (next || "/");
    return { ok: true, already: false, nextHref };
  }

  // Tenant-scoped booking lookup
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, tenantId: guard.tenantId },
    select: { id: true, tenantId: true },
  });

  if (!booking) return { ok: false, message: "Ingen bokning hittades." };

  const config = await getTenantConfig(booking.tenantId);
  const checkInTime = config.property?.checkInTime || "14:00";

  // Server-side validation: ensure all required active cards have data
  const activeCards = getActiveCheckinCards(config);
  const activeCardIds = new Set(activeCards.map((c) => c.id));

  for (const card of activeCards) {
    if (!card.optional && cardData[card.id] === undefined) {
      return { ok: false, message: `Obligatoriskt fält saknas: ${card.label}` };
    }
  }

  // Strip any fields that don't match active card IDs (except signature which is handled separately)
  for (const key of Object.keys(cardData)) {
    if (!activeCardIds.has(key as import("@/app/_lib/checkin-cards/types").CheckinCardId)) {
      delete cardData[key as keyof typeof cardData];
    }
  }

  // Perform check-in with signature (if provided)
  const signatureDataUrl = cardData.signature ?? undefined;
  const res = await performCheckIn(booking.id, checkInTime, new Date(), signatureDataUrl);
  if (!res.ok) return { ok: false, message: res.message };

  // Store additional card data in JSON column (non-signature fields)
  if (!res.already) {
    const { signature: _, ...extraData } = cardData;
    if (Object.keys(extraData).length > 0) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { checkinData: extraData },
      });
    }

    // PMS notification removed — booking engine uses real-time queries

    // Transition linked order fulfillment status (non-blocking)
    try {
      const linkedOrder = await prisma.order.findFirst({
        where: {
          tenantId: guard.tenantId,
          guestEmail: (await prisma.booking.findUnique({
            where: { id: booking.id },
            select: { guestEmail: true },
          }))?.guestEmail ?? "",
          fulfillmentStatus: "UNFULFILLED",
        },
        select: { id: true },
      });

      if (linkedOrder) {
        await transitionFulfillmentStatus(linkedOrder.id, guard.tenantId, "IN_PROGRESS", {
          note: "Gäst incheckad via självbetjäning",
        });
      }
    } catch (err) {
      log("error", "checkin.fulfillment_transition_failed", { bookingId: booking.id, error: String(err) });
    }

    // Send CHECK_IN_CONFIRMED email (non-blocking)
    try {
      const bookingData = await prisma.booking.findUnique({
        where: { id: booking.id },
        select: { guestEmail: true, firstName: true, lastName: true, arrival: true, departure: true, tenantId: true },
      });
      if (bookingData) {
        const tenant = await prisma.tenant.findUnique({ where: { id: bookingData.tenantId }, select: { name: true } });
        const { sendEmailEvent } = await import("@/app/_lib/email/send");
        await sendEmailEvent(bookingData.tenantId, "CHECK_IN_CONFIRMED", bookingData.guestEmail, {
          guestName: `${bookingData.firstName} ${bookingData.lastName}`,
          hotelName: tenant?.name ?? "",
          checkIn: bookingData.arrival.toISOString().slice(0, 10),
          checkOut: bookingData.departure.toISOString().slice(0, 10),
        });
      }
    } catch (err) {
      log("error", "checkin.email_failed", { bookingId: booking.id, error: String(err) });
    }
  }

  const nextHref = token ? `/p/${token}` : (next || "/");
  return { ok: true, already: res.already, nextHref };
}
