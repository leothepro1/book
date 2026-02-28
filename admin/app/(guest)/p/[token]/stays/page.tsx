import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function formatDate(d: Date) {
  return d.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: { token?: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const token = params?.token;
  const lang =
    (searchParams?.lang === "en" ? "en" : "sv") as "sv" | "en";

  const current = await prisma.booking.findFirst({
    where: token ? { id: token } : undefined,
  });

  if (!current) {
    return <div className="g-container">No booking found.</div>;
  }

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId: current.tenantId,
      guestEmail: current.guestEmail,
    },
    orderBy: {
      arrival: "desc",
    },
  });

  return (
    <div className="g-container">
      <h1
        className="g-heading"
        style={{ fontSize: 22, marginBottom: 16 }}
      >
        {lang === "en" ? "Stays" : "Bokningar"}
      </h1>

      <div style={{ display: "grid", gap: 14 }}>
        {bookings.map((b) => (
          <div key={b.id} className="g-stayCard">
            <img
              src="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=60"
              className="g-stayImage"
              alt=""
            />

            <div className="g-stayMeta">
              <div className="g-stayTitle">
                {b.unit}
              </div>

              <div className="g-stayDates">
                {formatDate(new Date(b.arrival))} –{" "}
                {formatDate(new Date(b.departure))}
              </div>

              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {b.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
