import "./page.css";
import { getTenantConfig } from "../../_lib/tenant";
import { buttonClass, backgroundStyle } from "../../_lib/theme";
import { resolveBookingFromToken } from "../../_lib/portal/resolveBooking";
import { getBookingStatus, canCheckIn, isCheckInTimeReached } from "../../_lib/booking";
import { BookingStatus } from "../../_lib/booking";

import BookingStatusCard from "../../_components/BookingStatusCard";
import WeatherWidget from "../../_components/WeatherWidget";

export const dynamic = "force-dynamic";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type Tile = {
  id: string;
  label: string;
  svg: React.ReactNode;
  href?: string;
  disabled?: boolean;
};

const DEFAULT_TILES: Tile[] = [
  {
    id: "checkin",
    label: "Check-in",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="tile-icon">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7Z" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 2v7h7" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 15h6M9 18h4" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "checkout",
    label: "Check-out",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="tile-icon">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7Z" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 2v7h7" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="m9 15 2 2 4-4" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "map",
    label: "Karta",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="tile-icon">
        <path d="m1 6 8-4 6 4 8-4v16l-8 4-6-4-8 4V6Z" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 2v16m6-12v16" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "info",
    label: "Info",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="tile-icon">
        <circle cx="12" cy="12" r="11.25" stroke="var(--text)" strokeWidth="1.5"/>
        <path d="M12 10.5V18" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 6v.5" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="tile-icon">
        <path d="M12 19.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fill="var(--text)"/>
        <path d="M6.713 13.428a7.5 7.5 0 0 1 10.568 0M3.532 10.247a12 12 0 0 1 16.935 0M.781 6.652a16.5 16.5 0 0 1 22.438 0" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default async function Page(props: { params: Promise<{ token?: string }> }) {
  const params = await props.params;
  const token = params?.token;

  const booking = await resolveBookingFromToken(token);

  if (!booking) {
    return <div style={{ padding: 20, color: "var(--text)" }}>Ingen bokning hittades.</div>;
  }

  const config = await getTenantConfig(booking.tenantId ?? "default");

  const now = new Date();
  const departure = new Date(booking.departure);
  const bookingStatus = getBookingStatus(booking);

  const checkoutHour = 12;
  const checkoutText = `Checkout is scheduled today at ${pad2(checkoutHour)}:00`;

  const title = `Välkommen ${booking.firstName}`;
  let subtitle = "";

  if (booking.status === BookingStatus.PRE_CHECKIN) {
    subtitle = "Vi ser fram emot din ankomst.";
  } else if (booking.status === BookingStatus.ACTIVE) {
    subtitle = "Vi hoppas att du har en trevlig vistelse hos oss.";
  } else if (booking.status === BookingStatus.COMPLETED) {
    subtitle = "Din vistelse är nu avslutad. Tack för ditt besök.";
  }


  // Update subtitle based on status
  if (isSameDay(now, departure)) {
    subtitle = checkoutText;
  } else if (bookingStatus === BookingStatus.ACTIVE) {
    subtitle = "You are currently checked in";
  } else if (bookingStatus === BookingStatus.COMPLETED) {
    subtitle = "Thank you for your stay";
  }

  const btnClass = buttonClass(config.theme);

  const heroImageUrl =
    (config as any)?.home?.heroImageUrl ||
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=60";

  const checkInTime = config.property.checkInTime || "14:00";
  const checkOutTime = config.property.checkOutTime || "11:00";
  
  // Check-in logic based on status
  const canCheckInNow = canCheckIn(booking, now);
  const checkInTimeReached = isCheckInTimeReached(booking, checkInTime, now);
  const canCheckInEffective = (canCheckInNow && checkInTimeReached);
  const isCheckedIn = bookingStatus === BookingStatus.ACTIVE;
  const isCompleted = bookingStatus === BookingStatus.COMPLETED;

  const keyIcon = (
    <svg viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12.75 9.807a6 6 0 1 0-7.5 5.811v6.136a1.5 1.5 0 0 0 3 0v-6.136a6 6 0 0 0 4.5-5.811" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.741 4.605a6 6 0 0 1 8.16 8.251l4.91 4.906a1.5 1.5 0 0 1-2.122 2.121l-4.907-4.906a6 6 0 0 1-2.172.766h-.044M6.75 10.557a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.75 7.406V3a2.25 2.25 0 1 1 4.5 0v.766" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const primary: Tile = {
    ...DEFAULT_TILES[0],
    id: "primary",
    label: isCompleted 
      ? "Vistelsen avslutad"
      : isCheckedIn 
        ? "Öppna dörr" 
        : canCheckInEffective 
          ? "Check-in" 
          : `Check-in öppnar ${checkInTime}`,
    svg: isCheckedIn ? keyIcon : DEFAULT_TILES[0].svg,
    href: isCompleted || isCheckedIn ? undefined : canCheckInEffective ? `/check-in?token=${token}` : undefined,
    disabled: isCompleted || (!isCheckedIn && !canCheckInEffective),
  };

  const tiles: Tile[] = [primary, ...DEFAULT_TILES.slice(1, 5)];

  return (
    <div style={{ padding: "17px 17px 124px 17px" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 230,
          borderRadius: 12,
          overflow: "hidden",
          border: "none",
          background: "var(--background)",
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.75) 100%), url("${heroImageUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 13,
            right: 15,
            display: "grid",
            gap: 5,
            color: "white",
          }}
        >
          <div style={{ fontSize: 23, fontWeight: "bold", lineHeight: "1.1em", opacity: 1 }}>{title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.35, opacity: 0.92 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div
          style={{
            borderRadius: 12,
            padding: 16,
            background: "var(--surface)",
            color: "var(--text)",
            boxShadow: "0 0 0 1px #0000000a, 0 2px 4px #0000000f",
            fontSize: 15,
          }}
        >
          <BookingStatusCard booking={booking} mutedOpacity={config.theme.typography.mutedOpacity} checkInTime={config.property.checkInTime} checkOutTime={config.property.checkOutTime} />
        </div>

        <div
          style={{
            borderRadius: 12,
            padding: 16,
            background: "var(--surface)",
            color: "var(--text)",
            boxShadow: "0 0 0 1px #0000000a, 0 2px 4px #0000000f",
            fontSize: 15,
          }}
        >
          <WeatherWidget 
            latitude={config.property.latitude}
            longitude={config.property.longitude}
            mutedOpacity={config.theme.typography.mutedOpacity}
          />
        </div>
      </div>

      <div style={{ marginTop: 21, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {tiles.map((tile) => {
          const disabled = !!tile.disabled;
          const ButtonEl = (
            <button
              type="button"
              disabled={disabled}
              className={btnClass}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: disabled ? 0.55 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                aspectRatio: "5 / 4",
                boxShadow: "none",
                background: "#F1F0EE",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  border: "none",
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {tile.svg}
              </div>
            </button>
          );

          return (
            <div key={tile.id} style={{ display: "grid", gap: 8 }}>
              {tile.href && !disabled ? (
                <a href={tile.href} style={{ textDecoration: "none" }}>
                  {ButtonEl}
                </a>
              ) : (
                ButtonEl
              )}

              <div
                style={{
                  fontWeight: "bold",
                  fontSize: 13,
                  lineHeight: "1.2em",
                  color: "var(--text)",
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                {tile.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cards section */}
      {config.home.cards && config.home.cards.filter(c => c.isActive).length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 20, fontWeight: "bold", color: "var(--text)", marginBottom: 16, lineHeight: "1em" }}>Upptäck mer</h3>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginLeft: -17, marginRight: -17, paddingLeft: 17, paddingRight: 17, scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {config.home.cards
              .filter(c => c.isActive)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((card) => {
                const href =
                  card.type === "link"
                    ? card.openMode === "external" ? card.url : card.url
                    : card.type === "article"
                    ? `/p/${token}/article/${card.slug}`
                    : card.type === "download"
                    ? card.fileUrl
                    : undefined;

                const cardInner = (
                  <div
                    style={{
                      minWidth: "70%",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "var(--surface)",
                      boxShadow: "0 0 0 1px #0000000a, 0 2px 4px #0000000f",
                      flexShrink: 0,
                      cursor: href ? "pointer" : "default",
                    }}
                  >
                    {card.image ? (
                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "16 / 10",
                          backgroundImage: `url("${card.image}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          position: "relative",
                        }}
                      >
                        {card.badge && (
                          <span style={{
                            position: "absolute", top: 8, left: 8,
                            background: "var(--button-bg)", color: "var(--button-fg)",
                            fontSize: 11, fontWeight: 600, padding: "2px 8px",
                            borderRadius: 999,
                          }}>{card.badge}</span>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        width: "100%", aspectRatio: "16 / 10",
                        background: "var(--surface)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="32" height="32" viewBox="0 0 256 256" fill="var(--text)" opacity="0.2">
                          <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
                        </svg>
                      </div>
                    )}
                    <div style={{ padding: "12px 14px 14px" }}>
                      <div style={{ fontSize: 15, fontWeight: "bold", color: "var(--text)", lineHeight: 1.3 }}>{card.title}</div>
                      <div style={{ fontSize: 13, color: "var(--text)", opacity: 0.55, marginTop: 2, lineHeight: 1.3 }}>{card.description}</div>
                      {card.ctaLabel && (
                        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "var(--button-bg)" }}>{card.ctaLabel} →</div>
                      )}
                    </div>
                  </div>
                );

                return href ? (
                  <a key={card.id} href={href} style={{ textDecoration: "none", flexShrink: 0, minWidth: "70%" }}
                     target={card.type === "link" && card.openMode === "external" ? "_blank" : undefined}
                     rel={card.type === "link" && card.openMode === "external" ? "noopener noreferrer" : undefined}>
                    {cardInner}
                  </a>
                ) : (
                  <div key={card.id} style={{ flexShrink: 0, minWidth: "70%" }}>{cardInner}</div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
