import { prisma } from "./_lib/db/prisma";
import { BookingStatus } from "./(guest)/_lib/booking";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

function makeBookingNumber() {
  // 10 tecken, versaler+nummer (tillräckligt svårt att gissa, kort nog för användare)
  return crypto.randomBytes(6).toString("base64url").toUpperCase().slice(0, 10);
}

async function createFakeBooking(formData: FormData) {
  "use server";
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const guestEmail = String(formData.get("guestEmail") || "").trim();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const unit = String(formData.get("unit") || "").trim();
  const arrivalStr = String(formData.get("arrival") || "").trim();
  const departureStr = String(formData.get("departure") || "").trim();

  if (!firstName || !lastName || !guestEmail || !tenantId || !unit || !arrivalStr || !departureStr) {
    throw new Error("Alla fält måste fyllas i.");
  }

  const arrival = new Date(arrivalStr + "T15:00:00.000Z");
  const departure = new Date(departureStr + "T10:00:00.000Z");

  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) {
    throw new Error("Ogiltiga datum.");
  }

  if (departure <= arrival) {
    throw new Error("Avresedatum måste vara efter ankomstdatum.");
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error("Tenant finns inte.");
  }

  // Om tomt: generera. Om angivet: använd och låt DB/unique fånga kollision.
  await prisma.booking.create({
    data: {tenantId,
      firstName,
      lastName,
      guestEmail,
      arrival,
      departure,
      unit,
      status: BookingStatus.PRE_CHECKIN,
    },
  });

  revalidatePath("/");
}

export default async function Page() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { tenant: true },
  });

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1>Fake Booking Creator</h1>

      <form action={createFakeBooking} style={{ marginTop: 20 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label>Tenant</label>
            <select name="tenantId" required style={{ width: "100%", padding: 8 }}>
              <option value="">Välj tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Bokningsnummer (valfritt)</label>
            <input name="bookingNumber" placeholder="Lämna tomt för autogenerering" style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <label>Förnamn</label>
            <input name="firstName" required style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <label>Efternamn</label>
            <input name="lastName" required style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <label>E-post</label>
            <input name="guestEmail" type="email" required style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <label>Enhet</label>
            <input name="unit" required style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <label>Ankomst (YYYY-MM-DD)</label>
            <input name="arrival" type="date" required style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <label>Avresa (YYYY-MM-DD)</label>
            <input name="departure" type="date" required style={{ width: "100%", padding: 8 }} />
          </div>

          <button type="submit" style={{ padding: 12, background: "#000", color: "#fff", border: 0 }}>
            Skapa bokning
          </button>
        </div>
      </form>

      <h2 style={{ marginTop: 40 }}>Senaste bokningar</h2>
      <ul style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {bookings.map((b) => (
          <li key={b.id} style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {b.firstName} {b.lastName} — {b.tenant?.name}
            </div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              <div>
                <b>Bokningsnummer:</b> {b.id}
              </div>
              <div>
                <b>DB id:</b> {b.id}
              </div>
              <div>
                {new Date(b.arrival).toISOString().slice(0, 10)} → {new Date(b.departure).toISOString().slice(0, 10)} ({b.unit})
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
