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
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { log } from "@/app/_lib/logger";
import { randomBytes, createHash } from "crypto";

const inputSchema = CreateBookingParamsSchema;

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("bk", 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

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

  // ── Resolve tenant from host — never from request body ────────
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }
  const tenantId = tenant.id;

  // ── Date validation ───────────────────────────────────────────
  const dateCheck = validateStayDates(body.checkIn, body.checkOut);
  if (!dateCheck.valid) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: dateCheck.error },
      { status: 400 },
    );
  }
  const { checkIn, checkOut } = dateCheck;
  const nights = dateCheck.nights;

  // ── Idempotency lock — prevent concurrent duplicate bookings ──
  const idempotencyKey = createHash("sha256")
    .update(`${tenantId}-${body.categoryId}-${body.checkIn}-${body.checkOut}-${body.guestInfo.email}`)
    .digest("hex");

  try {
    await prisma.pendingBookingLock.create({
      data: { key: idempotencyKey, expiresAt: new Date(Date.now() + 60_000) },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "DUPLICATE_BOOKING", message: "En bokning för dessa datum pågår redan. Försök igen om en stund." },
        { status: 409 },
      );
    }
    throw e;
  }

  try {
    return await processBooking();
  } finally {
    // Always release the lock
    await prisma.pendingBookingLock.delete({ where: { key: idempotencyKey } }).catch(() => {});
  }

  async function processBooking() {

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
      hotelName: tenant!.name,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      roomType: body.categoryId,
      bookingRef: confirmation.confirmationNumber,
      loginUrl: "",
    });
  } catch (err) {
    log("error", "booking.confirmation_email_failed", { tenantId, error: String(err) });
    // Email failure NEVER aborts booking
  }

  // Emit platform event for app webhooks (non-blocking)
  import("@/app/_lib/apps/webhooks").then(({ emitPlatformEvent }) =>
    emitPlatformEvent({
      type: "booking.confirmed",
      tenantId,
      payload: {
        bookingId: booking.id,
        guestEmail: body.guestInfo.email,
        guestName: `${body.guestInfo.firstName} ${body.guestInfo.lastName}`,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        categoryId: body.categoryId,
        confirmationNumber: confirmation.confirmationNumber,
      },
    }),
  ).catch((err) => log("error", "booking.app_event_emit_failed", { bookingId: booking.id, error: String(err) }));

  log("info", "booking.created", {
    tenantId, bookingId: booking.id, categoryId: body.categoryId,
    checkIn: body.checkIn, checkOut: body.checkOut,
  });

  return NextResponse.json({
    confirmationNumber: confirmation.confirmationNumber,
    bookingId: booking.id,
    portalToken,
    totalAmount: serverTotalAmount,
    currency: serverCurrency,
  });

  } // end processBooking
}
