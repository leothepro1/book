import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(d: Date) {
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { token?: string } }) {
  const token = params?.token;

  // Robust: använd findFirst så vi aldrig skickar id: undefined till Prisma
  const booking = await prisma.booking.findFirst({
    where: token ? { id: token } : undefined,
    orderBy: { createdAt: "desc" },
    include: { tenant: true },
  });

  if (!booking) {
    return <div style={{ padding: 17, color: "var(--text)" }}>Ingen bokning hittades.</div>;
  }

  const now = new Date();
  const arrival = new Date(booking.arrival);
  const departure = new Date(booking.departure);

  const checkoutHour = 12; // backup tills admin-panel sätter detta per tenant
  const checkoutText = `Checkout is scheduled today at ${String(checkoutHour).padStart(2, "0")}:00`;

  const title = `Välkommen ${booking.guestName}`;
  let subtitle = "you're booked to stay with us";

  if (isSameDay(now, departure)) {
    subtitle = checkoutText;
  } else if (booking.status === "checked_in") {
    subtitle = "You are currently checked in";
  }

  return (
    <div style={{ paddingLeft: 17, paddingRight: 17, paddingTop: 14, paddingBottom: 24 }}>
      {/* HERO IMAGE */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 210,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.08)",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%), url('https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=60') center/cover no-repeat",
        }}
      >
        {/* Bottom-left overlay text */}
        <div
          style={{
            position: "absolute",
            left: 15,
            bottom: 10,
            right: 15,
            display: "grid",
            gap: 8,
            color: "white",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.15 }}>{title}</div>
          <div style={{ fontSize: 14, opacity: 0.92, lineHeight: 1.35 }}>{subtitle}</div>
        </div>
      </div>

      {/* TWO CONTAINERS ROW */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {/* Left: check-in/out dates */}
        <div
          style={{
            borderRadius: 18,
            padding: 14,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.9)",
            color: "var(--text)",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900 }}>Check-in</div>
              <div style={{ marginTop: 4, opacity: 0.75 }}>{formatDate(arrival)}</div>
            </div>

            <div>
              <div style={{ fontWeight: 900 }}>Check-out</div>
              <div style={{ marginTop: 4, opacity: 0.75 }}>{formatDate(departure)}</div>
            </div>
          </div>
        </div>

        {/* Right: weather placeholder */}
        <div
          style={{
            borderRadius: 18,
            padding: 14,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.9)",
            color: "var(--text)",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Väder</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ opacity: 0.75 }}>Idag</span>
              <span style={{ fontWeight: 800 }}>—° / —°</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ opacity: 0.75 }}>Imorgon</span>
              <span style={{ fontWeight: 800 }}>—° / —°</span>
            </div>

            <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.35 }}>
              (Placeholder — kopplas till väder senare)
            </div>
          </div>
        </div>
      </div>

      {/* BUTTON GRID (placeholders) */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {["Check-in", "Nyckel/Dörr", "Information", "FAQ", "Kontakt", "Köp tillval"].map(
            (label) => (
              <button
                key={label}
                type="button"
                style={{
                  borderRadius: 18,
                  padding: "14px 12px",
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "white",
                  color: "var(--text)",
                  fontWeight: 900,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {label}
                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6, fontWeight: 600 }}>
                  Placeholder
                </div>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}