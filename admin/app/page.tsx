import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

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

  await prisma.booking.create({
    data: {
      tenantId,
      firstName,
      lastName,
      guestEmail,
      arrival,
      departure,
      unit,
      status: "booked",
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
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { tenant: true },
  });

  return (
    <main style={{ padding: 24, fontFamily: "Arial", maxWidth: 900 }}>
      <h1>Admin – Fake bokningar</h1>

      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Skapa bokning</h2>

        <form action={createFakeBooking} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label>Förnamn</label>
            <input name="firstName" placeholder="Test" required />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Efternamn</label>
            <input name="lastName" placeholder="Gäst" required />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Email</label>
            <input
              name="guestEmail"
              type="email"
              placeholder="test@exempel.se"
              required
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Camping (tenant)</label>
            <select
              name="tenantId"
              required
              defaultValue={tenants[0]?.id ?? ""}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {tenants.length === 0 && (
              <small style={{ color: "crimson" }}>
                Inga tenants finns. Skapa en tenant först i DB/seed.
              </small>
            )}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Datum från</label>
            <input name="arrival" type="date" required />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Datum till</label>
            <input name="departure" type="date" required />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Plats/enhet</label>
            <input name="unit" placeholder="A12" required />
          </div>

          <button type="submit" disabled={tenants.length === 0}>
            Skapa bokning
          </button>
        </form>
      </section>

      <section>
        <h2>Senaste bokningar</h2>
        <p>Antal bokningar: {bookings.length}</p>

        <ul style={{ paddingLeft: 18 }}>
          {bookings.map((b) => (
            <li key={b.id} style={{ marginBottom: 12 }}>
              <div>
                <b>
                  {b.firstName} {b.lastName}
                </b>{" "}
                ({b.guestEmail})
              </div>
              <div>Camping: {b.tenant?.name}</div>
              <div>
                Datum:{" "}
                {new Date(b.arrival).toLocaleString("sv-SE")} →{" "}
                {new Date(b.departure).toLocaleString("sv-SE")}
              </div>
              <div>
                Plats: {b.unit} | Status: {b.status}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}