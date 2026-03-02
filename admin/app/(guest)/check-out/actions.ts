"use server";

import { prisma } from "../../_lib/db/prisma";
import { redirect } from "next/navigation";
import { performCheckOut } from "../_lib/booking/actions";

type Method = "booking" | "nameArrival" | "email";

function norm(s?: string) {
  return (s || "").trim();
}

function isoToDayRange(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

// OBS: payload är "any" för att matcha CheckOutClient SubmitPayload utan TS-bråk.
// Vi validerar strikt inuti funktionen.
export async function checkOutLookup(payload: any): Promise<void> {
  const now = new Date();

  const method = norm(payload?.method) as Method;
  const token = norm(payload?.token);

  let booking: { id: string } | null = null;

  if (method === "booking") {
    const bookingId = norm(payload?.bookingId);
    const lastName = norm(payload?.lastName);
    if (!bookingId || !lastName) throw new Error("Fyll i bokningsnummer och efternamn.");

    booking = await prisma.booking.findFirst({
      where: { id: bookingId, lastName: { equals: lastName, mode: "insensitive" } },
      select: { id: true },
    });
  } else if (method === "email") {
    const email = norm(payload?.email);
    const lastName = norm(payload?.lastName);
    const departureDateISO = norm(payload?.departureDateISO);
    if (!email || !lastName || !departureDateISO) throw new Error("Fyll i e-post, efternamn och avresedatum.");

    const { start, end } = isoToDayRange(departureDateISO);
    booking = await prisma.booking.findFirst({
      where: {
        guestEmail: { equals: email, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
        departure: { gte: start, lt: end },
      },
      select: { id: true },
    });
  } else if (method === "nameArrival") {
    const name = norm(payload?.name);
    const departureDateISO = norm(payload?.departureDateISO);
    if (!name || !departureDateISO) throw new Error("Fyll i namn och avresedatum.");

    const { start, end } = isoToDayRange(departureDateISO);
    booking = await prisma.booking.findFirst({
      where: {
        OR: [
          { firstName: { equals: name, mode: "insensitive" } },
          { lastName: { equals: name, mode: "insensitive" } },
        ],
        departure: { gte: start, lt: end },
      },
      select: { id: true },
    });
  } else {
    throw new Error("Ogiltig metod.");
  }

  if (!booking) throw new Error("Ingen bokning hittades. Kontrollera uppgifterna.");

  const res = await performCheckOut(booking.id, now);
  if (!res.ok) throw new Error(res.message);

  if (token) redirect(`/p/${token}`);
  redirect("/");
}
