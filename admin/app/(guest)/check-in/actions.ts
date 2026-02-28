"use server";

import { prisma } from "../../_lib/db/prisma";
import { redirect } from "next/navigation";
import crypto from "crypto";

function norm(s?: string) {
  return (s || "").trim();
}

function parseISODateOnly(s?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

async function createMagicLinkForBooking(bookingId: string) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min
  await prisma.magicLink.create({ data: { token, bookingId, expiresAt } });
  return token;
}

// OBS: payload:any för att undvika "Method" typ-krock med ui.tsx
export async function checkInLookup(payload: any) {
  const methodRaw = norm(payload?.method);

  // tillåt både "booking" och "bookingNumber" (UI kan använda "booking")
  const method =
    methodRaw === "booking" ? "bookingNumber" :
    methodRaw === "bookingNumber" ? "bookingNumber" :
    methodRaw === "nameArrival" ? "nameArrival" :
    methodRaw === "email" ? "email" :
    "";

  if (method === "bookingNumber") {
    const bookingId = norm(payload?.bookingId ?? payload?.bookingNumber);
    const lastName = norm(payload?.lastName);

    if (!bookingId || !lastName) throw new Error("Fyll i bokningsnummer och efternamn.");

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, lastName: { equals: lastName, mode: "insensitive" } },
      select: { id: true },
    });

    if (!booking) throw new Error("Ingen bokning hittades.");
    const token = await createMagicLinkForBooking(booking.id);
    redirect(`/p/${token}`);
  }

  if (method === "nameArrival") {
    const fullName = norm(payload?.name);
    const arrivalDate = norm(payload?.arrivalDateISO ?? payload?.arrivalDate);

    if (!fullName || !arrivalDate) throw new Error("Fyll i namn och incheckningsdatum.");

    const dt = parseISODateOnly(arrivalDate);
    if (!dt) throw new Error("Ogiltigt datum.");

    const start = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1, 0, 0, 0));

    const booking = await prisma.booking.findFirst({
      where: {
        arrival: { gte: start, lt: end },
        OR: [
          { firstName: { contains: fullName, mode: "insensitive" } },
          { lastName: { contains: fullName, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!booking) throw new Error("Ingen bokning hittades.");
    const token = await createMagicLinkForBooking(booking.id);
    redirect(`/p/${token}`);
  }

  if (method === "email") {
    const email = norm(payload?.email);
    const lastName = norm(payload?.lastName);
    const departureDate = norm(payload?.departureDateISO ?? payload?.departureDate);

    if (!email || !lastName || !departureDate) {
      throw new Error("Fyll i e-post, efternamn och utcheckningsdatum.");
    }

    const dt = parseISODateOnly(departureDate);
    if (!dt) throw new Error("Ogiltigt datum.");

    const start = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1, 0, 0, 0));

    const booking = await prisma.booking.findFirst({
      where: {
        guestEmail: { equals: email, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
        departure: { gte: start, lt: end },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!booking) throw new Error("Ingen bokning hittades.");
    const token = await createMagicLinkForBooking(booking.id);
    redirect(`/p/${token}`);
  }

  throw new Error("Ogiltigt val.");
}
