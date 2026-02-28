"use server";

import { prisma } from "../../_lib/db/prisma";
import { redirect } from "next/navigation";
import crypto from "crypto";

function norm(s: string) {
  return (s || "").trim();
}

function isoDateOnly(d: Date) {
  // YYYY-MM-DD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODateOnly(s: string) {
  // s = YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

async function createMagicLinkForBooking(bookingId: string) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min

  await prisma.magicLink.create({
    data: {
      token,
      bookingId,
      expiresAt,
    },
  });

  return token;
}

export async function checkInLookup(formData: FormData) {
  const method = norm(String(formData.get("method") || ""));

  // bookingNumber = Booking.id (för nu)
  if (method === "bookingNumber") {
    const bookingNumber = norm(String(formData.get("bookingNumber") || ""));
    const lastName = norm(String(formData.get("lastName") || ""));

    if (!bookingNumber || !lastName) throw new Error("Fyll i bokningsnummer och efternamn.");

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingNumber,
        lastName: { equals: lastName, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (!booking) throw new Error("Ingen bokning hittades.");
    const token = await createMagicLinkForBooking(booking.id);
    redirect(`/p/${token}`);
  }

  // name+arrivalDate
  if (method === "nameArrival") {
    const fullName = norm(String(formData.get("name") || ""));
    const arrivalDate = norm(String(formData.get("arrivalDate") || "")); // YYYY-MM-DD

    if (!fullName || !arrivalDate) throw new Error("Fyll i namn och incheckningsdatum.");

    const dt = parseISODateOnly(arrivalDate);
    if (!dt) throw new Error("Ogiltigt datum.");

    // matchar på samma dag (UTC-date)
    const booking = await prisma.booking.findFirst({
      where: {
        arrival: {
          gte: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0)),
          lt: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1, 0, 0, 0)),
        },
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

  // email + lastName + departureDate (stänger modal direkt i UI, servern validerar datum)
  if (method === "email") {
    const email = norm(String(formData.get("email") || ""));
    const lastName = norm(String(formData.get("lastName") || ""));
    const departureDate = norm(String(formData.get("departureDate") || "")); // YYYY-MM-DD

    if (!email || !lastName || !departureDate) throw new Error("Fyll i e-post, efternamn och utcheckningsdatum.");

    const dt = parseISODateOnly(departureDate);
    if (!dt) throw new Error("Ogiltigt datum.");

    const booking = await prisma.booking.findFirst({
      where: {
        guestEmail: { equals: email, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
        departure: {
          gte: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0)),
          lt: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1, 0, 0, 0)),
        },
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
