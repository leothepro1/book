export const dynamic = "force-dynamic";

/**
 * Booking Creation API
 * ════════════════════
 *
 * Creates a booking via PMS adapter + stores in local DB.
 * Re-validates availability AND price server-side before creating.
 * Never trusts client-supplied totalAmount — always re-computes from PMS.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { CreateBookingParamsSchema } from "@/app/_lib/integrations/types";
import { randomBytes } from "crypto";

const inputSchema = z
  .object({
    tenantId: z.string().min(1),
  })
  .merge(CreateBookingParamsSchema);

export async function POST(req: Request) {
  let body: z.infer<typeof inputSchema>;
  try {
    const raw = await req.json();
    body = inputSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "Ogiltig begäran" },
      { status: 400 },
    );
  }

  const tenantId = body.tenantId;

  // ── Date validation ───────────────────────────────────────────
  const checkIn = new Date(body.checkIn);
  const checkOut = new Date(body.checkOut);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "Ogiltigt datumformat" },
      { status: 400 },
    );
  }
  if (checkIn < now) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "Incheckning kan inte vara i det förflutna" },
      { status: 400 },
    );
  }
  if (checkOut <= checkIn) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: "Utcheckning måste vara efter incheckning" },
      { status: 400 },
    );
  }

  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);

  // ── Tenant verification ───────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  let adapter;
  try {
    adapter = await resolveAdapter(tenantId);
  } catch {
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Bokningssystemet är tillfälligt otillgängligt." },
      { status: 503 },
    );
  }

  // ── Re-validate availability + price server-side ──────────────
  let serverTotalAmount: number;
  let serverCurrency: string;

  try {
    const availability = await adapter.getAvailability(tenantId, {
      checkIn,
      checkOut,
      guests: body.guests,
    });

    const entry = availability.categories.find(
      (e) => e.category.externalId === body.categoryId,
    );

    if (!entry || entry.availableUnits <= 0) {
      return NextResponse.json(
        { error: "NO_LONGER_AVAILABLE", message: "Tyvärr är detta boende inte längre tillgängligt för dessa datum." },
        { status: 409 },
      );
    }

    const ratePlan = entry.ratePlans.find((rp) => rp.externalId === body.ratePlanId);
    if (!ratePlan) {
      return NextResponse.json(
        { error: "NO_LONGER_AVAILABLE", message: "Det valda prisalternativet är inte längre tillgängligt." },
        { status: 409 },
      );
    }

    // Use PMS-confirmed price — NEVER trust client totalAmount
    serverTotalAmount = ratePlan.totalPrice;
    serverCurrency = ratePlan.currency;

    // Add addon prices (re-fetched from PMS)
    if (body.addons.length > 0) {
      const pmsAddons = await adapter.getAddons(tenantId, body.categoryId);
      for (const selected of body.addons) {
        const pmsAddon = pmsAddons.find((a) => a.externalId === selected.addonId);
        if (!pmsAddon) continue; // Addon no longer available — skip silently
        switch (pmsAddon.pricingMode) {
          case "PER_STAY":
            serverTotalAmount += pmsAddon.price * selected.quantity;
            break;
          case "PER_NIGHT":
            serverTotalAmount += pmsAddon.price * nights * selected.quantity;
            break;
          case "PER_PERSON":
            serverTotalAmount += pmsAddon.price * body.guests * selected.quantity;
            break;
          case "PER_PERSON_PER_NIGHT":
            serverTotalAmount += pmsAddon.price * body.guests * nights * selected.quantity;
            break;
        }
      }
    }
  } catch {
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Kunde inte verifiera tillgänglighet." },
      { status: 503 },
    );
  }

  // ── Re-validate restrictions ──────────────────────────────────
  try {
    const restrictions = await adapter.getRestrictions(tenantId, checkIn, checkOut, body.categoryId);
    const ciDate = new Date(body.checkIn);
    ciDate.setHours(0, 0, 0, 0);
    const coDate = new Date(body.checkOut);
    coDate.setHours(0, 0, 0, 0);

    for (const r of restrictions) {
      const rDate = new Date(r.date);
      rDate.setHours(0, 0, 0, 0);
      if (r.minStay != null && nights < r.minStay) {
        return NextResponse.json(
          { error: "RESTRICTION_VIOLATED", message: `Minsta vistelse är ${r.minStay} nätter.` },
          { status: 409 },
        );
      }
      if (r.closedToArrival && rDate.getTime() === ciDate.getTime()) {
        return NextResponse.json(
          { error: "RESTRICTION_VIOLATED", message: "Incheckning är inte möjlig detta datum." },
          { status: 409 },
        );
      }
      if (r.closedToDeparture && rDate.getTime() === coDate.getTime()) {
        return NextResponse.json(
          { error: "RESTRICTION_VIOLATED", message: "Utcheckning är inte möjlig detta datum." },
          { status: 409 },
        );
      }
    }
  } catch {
    // Restriction check failure non-blocking — proceed with booking
  }

  // ── Create booking via PMS ────────────────────────────────────
  let confirmation;
  try {
    confirmation = await adapter.createBooking(tenantId, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bokningen kunde inte skapas.";
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message },
      { status: 503 },
    );
  }

  // ── Store in local DB (after PMS confirms) ────────────────────
  const portalToken = randomBytes(24).toString("base64url");

  const booking = await prisma.booking.create({
    data: {
      tenantId,
      externalId: confirmation.externalId,
      externalSource: adapter.provider,
      firstName: body.guestInfo.firstName,
      lastName: body.guestInfo.lastName,
      guestEmail: body.guestInfo.email,
      phone: body.guestInfo.phone ?? null,
      arrival: checkIn,
      departure: checkOut,
      unit: body.categoryId,
      status: "PRE_CHECKIN",
      portalToken,
    },
  });

  // ── Send confirmation email (non-blocking) ────────────────────
  try {
    const { sendEmailEvent } = await import("@/app/_lib/email/send");
    await sendEmailEvent(tenantId, "BOOKING_CONFIRMED", body.guestInfo.email, {
      guestName: `${body.guestInfo.firstName} ${body.guestInfo.lastName}`,
      hotelName: tenant.name,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      roomType: body.categoryId,
      bookingRef: confirmation.confirmationNumber,
      loginUrl: "",
    });
  } catch (err) {
    console.error("[bookings] Failed to send confirmation email:", err);
    // Email failure NEVER aborts booking
  }

  return NextResponse.json({
    confirmationNumber: confirmation.confirmationNumber,
    bookingId: booking.id,
    portalToken,
    totalAmount: serverTotalAmount,
    currency: serverCurrency,
  });
}
