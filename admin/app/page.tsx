import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function Page() {
  const bookings = await prisma.booking.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { tenant: true },
  });

  return (
    <main style={{ padding: 24, fontFamily: "Arial" }}>
      <h1>Admin – Bokningar</h1>

      <p>Antal bokningar: {bookings.length}</p>

      <ul>
        {bookings.map((b) => (
          <li key={b.id} style={{ marginBottom: 12 }}>
            <div><b>{b.guestName}</b> ({b.guestEmail})</div>
            <div>Camping: {b.tenant?.name}</div>
            <div>Datum: {b.arrival.toISOString()} → {b.departure.toISOString()}</div>
            <div>Plats: {b.unit} | Status: {b.status}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}