import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { getTenantConfig } from "../../../_lib/tenant";
import { buttonClass } from "../../../_lib/theme";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

function formatDate(d: Date, lang: "sv" | "en") {
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { token?: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const token = params?.token;
  const lang = (searchParams?.lang === "en" ? "en" : "sv") as "sv" | "en";

  // OBS: I er nuvarande implementation används token som Booking.id (inte MagicLink.token)
  const booking = await prisma.booking.findFirst({
    where: token ? { id: token } : undefined,
    orderBy: { createdAt: "desc" },
    include: { tenant: true },
  });

  if (!booking) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        {lang === "en" ? "No booking found." : "Ingen bokning hittades."}
      </div>
    );
  }

  const config = await getTenantConfig(booking.tenantId ?? "default");
  const btnClass = buttonClass(config.theme);

  // Hämta “kundprofil” baserat på samma tenant + guestEmail (som ni gör på stays-sidan)
  const allBookings = await prisma.booking.findMany({
    where: {
      tenantId: booking.tenantId,
      guestEmail: booking.guestEmail,
    },
    orderBy: { arrival: "desc" },
  });

  const latest = allBookings[0] ?? booking;

  const t =
    lang === "en"
      ? {
          title: "Account",
          subtitle: "Your details and stays",
          profile: "Profile",
          address: "Address",
          stays: "Your stays",
          openStays: "Open stays",
          email: "Email",
          phone: "Phone",
          name: "Name",
          street: "Street",
          postal: "Postal code",
          city: "City",
          country: "Country",
          unknown: "—",
          count: "Total stays",
        }
      : {
          title: "Konto",
          subtitle: "Dina uppgifter och vistelser",
          profile: "Profil",
          address: "Adress",
          stays: "Dina vistelser",
          openStays: "Öppna bokningar",
          email: "E-post",
          phone: "Telefon",
          name: "Namn",
          street: "Gata",
          postal: "Postnummer",
          city: "Stad",
          country: "Land",
          unknown: "—",
          count: "Antal vistelser",
        };

  return (
    <div style={{ padding: "14px 17px 24px 17px" }}>
      {/* Header */}
      <div
        style={{
          borderRadius: 18,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900 }}>{t.title}</div>
        <div style={{ marginTop: 6, opacity: config.theme.typography.mutedOpacity }}>
          {t.subtitle}
        </div>

        <div style={{ marginTop: 12 }}>
          <Link
            href={`/p/${booking.id}/stays${lang === "en" ? "?lang=en" : ""}`}
            className={btnClass}
            style={{ display: "inline-flex", width: "auto" }}
          >
            {t.openStays}
          </Link>
        </div>
      </div>

      {/* Profile */}
      <div
        style={{
          marginTop: 12,
          borderRadius: 18,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>{t.profile}</div>

        <div style={{ display: "grid", gap: 10 }}>
          <Row label={t.name} value={`${latest.firstName} ${latest.lastName}`} />
          <Row label={t.email} value={latest.guestEmail || t.unknown} />
          <Row label={t.phone} value={latest.phone || t.unknown} />
        </div>
      </div>

      {/* Address */}
      <div
        style={{
          marginTop: 12,
          borderRadius: 18,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>{t.address}</div>

        <div style={{ display: "grid", gap: 10 }}>
          <Row label={t.street} value={latest.street || t.unknown} />
          <Row label={t.postal} value={latest.postalCode || t.unknown} />
          <Row label={t.city} value={latest.city || t.unknown} />
          <Row label={t.country} value={latest.country || t.unknown} />
        </div>
      </div>

      {/* Stays (preview) */}
      <div
        style={{
          marginTop: 12,
          borderRadius: 18,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 900 }}>{t.stays}</div>
          <div style={{ opacity: config.theme.typography.mutedOpacity, fontSize: 13 }}>
            {t.count}: {allBookings.length}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {allBookings.slice(0, 3).map((b) => (
            <div
              key={b.id}
              style={{
                borderRadius: 16,
                border: "1px solid var(--border)",
                padding: 12,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div className="g-stayDates">
                    {formatDate(new Date(b.arrival), lang)} – {formatDate(new Date(b.departure), lang)}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {b.firstName} {b.lastName}
                  </div>

                  {(b.city || b.country) && (
                    <div className="g-muted">
                      {[b.city, b.country].filter(Boolean).join(", ")}
                    </div>
                  )}

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

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {lang === "en" ? "Unit" : "Plats"}: <span style={{ fontWeight: 800 }}>{b.unit}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {allBookings.length > 3 && (
            <div style={{ opacity: config.theme.typography.mutedOpacity, fontSize: 13 }}>
              {lang === "en"
                ? `Showing 3 of ${allBookings.length} stays.`
                : `Visar 3 av ${allBookings.length} vistelser.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div style={{ opacity: 0.75, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>{value}</div>
    </div>
  );
}
