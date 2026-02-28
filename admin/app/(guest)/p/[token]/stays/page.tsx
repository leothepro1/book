import { prisma } from "../../../../_lib/db/prisma";


function formatDate(d: Date, lang: "sv" | "en") {
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
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
              {/* Unit / Property reference */}
              <div className="g-stayTitle">
                {b.unit}
              </div>

              {/* Dates */}
              <div className="g-stayDates">
                {formatDate(new Date(b.arrival), lang)} –{" "}
                {formatDate(new Date(b.departure), lang)}
              </div>

              {/* Guest name */}
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {b.firstName} {b.lastName}
              </div>

              {/* Location (if exists) */}
              {(b.city || b.country) && (
                <div className="g-muted">
                  {[b.city, b.country].filter(Boolean).join(", ")}
                </div>
              )}

              {/* Status */}
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.85,
                  textTransform: "capitalize",
                }}
              >
                {b.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}