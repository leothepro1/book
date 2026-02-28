import { PrismaClient } from "@prisma/client";
import { getTenantConfig } from "../../_lib/tenant";
import { buttonClass, backgroundStyle } from "../../_lib/theme";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(d: Date) {
  return d.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function Page({
  params,
}: {
  params: { token?: string };
}) {
  const token = params?.token;

  const booking = await prisma.booking.findFirst({
    where: token ? { id: token } : undefined,
    orderBy: { createdAt: "desc" },
    include: { tenant: true },
  });

  if (!booking) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        Ingen bokning hittades.
      </div>
    );
  }

  const config = await getTenantConfig(booking.tenantId ?? "default");

  const now = new Date();
  const arrival = new Date(booking.arrival);
  const departure = new Date(booking.departure);

  const checkoutHour = 12;
  const checkoutText = `Checkout is scheduled today at ${String(
    checkoutHour
  ).padStart(2, "0")}:00`;

  const title = `Välkommen ${booking.guestName}`;
  let subtitle = "you're booked to stay with us";

  if (isSameDay(now, departure)) {
    subtitle = checkoutText;
  } else if (booking.status === "checked_in") {
    subtitle = "You are currently checked in";
  }

  const btnClass = buttonClass(config.theme);

  const links = [...config.home.links]
    .filter((l) => l.isEnabled)
    .sort((a, b) => a.order - b.order);

  return (
    <div style={{ padding: "14px 17px 24px 17px" }}>
      {/* HERO */}
      <div
        style={{
          ...backgroundStyle(config.theme.background),
          position: "relative",
          width: "100%",
          height: 210,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 15,
            bottom: 12,
            right: 15,
            display: "grid",
            gap: 8,
            color: "var(--text)",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              lineHeight: 1.15,
              opacity: 1,
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.35,
              opacity: config.theme.typography.mutedOpacity,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      {/* INFO CARDS */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            padding: 14,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900 }}>Check-in</div>
              <div
                style={{
                  marginTop: 4,
                  opacity: config.theme.typography.mutedOpacity,
                }}
              >
                {formatDate(arrival)}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 900 }}>Check-out</div>
              <div
                style={{
                  marginTop: 4,
                  opacity: config.theme.typography.mutedOpacity,
                }}
              >
                {formatDate(departure)}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            padding: 14,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Väder</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span
                style={{ opacity: config.theme.typography.mutedOpacity }}
              >
                Idag
              </span>
              <span style={{ fontWeight: 800 }}>—° / —°</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span
                style={{ opacity: config.theme.typography.mutedOpacity }}
              >
                Imorgon
              </span>
              <span style={{ fontWeight: 800 }}>—° / —°</span>
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: config.theme.typography.mutedOpacity,
              }}
            >
              (Placeholder — kopplas till väder senare)
            </div>
          </div>
        </div>
      </div>

      {/* DYNAMIC BUTTON GRID */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              className={btnClass}
              style={{ textAlign: "left" }}
            >
              <div style={{ fontWeight: 900 }}>
                {link.label_sv}
              </div>

              <div
                style={{
                  fontSize: 12,
                  marginTop: 6,
                  opacity: config.theme.typography.mutedOpacity,
                  fontWeight: 600,
                }}
              >
                {link.type}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}