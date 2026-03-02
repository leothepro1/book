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
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M216,56H40A16,16,0,0,0,24,72V184a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V72A16,16,0,0,0,216,56Zm0,16V96H40V72ZM40,184V112H216v72Z" />
      </svg>
    ),
  },
  {
    id: "checkout",
    label: "Check-out",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm0,144H32V64H224V192ZM80,104h96a8,8,0,0,1,0,16H80a8,8,0,0,1,0-16Zm0,32h56a8,8,0,0,1,0,16H80a8,8,0,0,1,0-16Z" />
      </svg>
    ),
  },
  {
    id: "map",
    label: "Karta",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M224,56a8,8,0,0,0-6.9-7.9l-56-8a8,8,0,0,0-4.2.6L104,66.6,39.1,48.1A8,8,0,0,0,24,56V200a8,8,0,0,0,6.9,7.9l56,8a8,8,0,0,0,4.2-.6L152,189.4l64.9,18.5A8,8,0,0,0,232,200V56ZM96,198.2l-56-8V65.8l56,8Zm64-8.4L112,205.4V73.8l48-13.7Zm56,0-56-16V58.8l56,8Z" />
      </svg>
    ),
  },
  {
    id: "info",
    label: "Info",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm8-56V112a8,8,0,0,0-16,0v48a8,8,0,0,0,16,0Zm-8-72a12,12,0,1,0,12,12A12,12,0,0,0,128,88Z" />
      </svg>
    ),
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M128,200a16,16,0,1,0,16,16A16,16,0,0,0,128,200Zm94.1-91.6a152,152,0,0,0-188.2,0,8,8,0,0,0,9.9,12.6,136,136,0,0,1,168.4,0,8,8,0,0,0,9.9-12.6ZM128,152a96,96,0,0,0-59.7,20.8,8,8,0,0,0,10,12.5,80,80,0,0,1,99.4,0,8,8,0,0,0,10-12.5A96,96,0,0,0,128,152Zm0-48A144,144,0,0,0,48.3,128.8a8,8,0,0,0,10,12.5,128,128,0,0,1,139.4,0,8,8,0,0,0,10-12.5A144,144,0,0,0,128,104Z" />
      </svg>
    ),
  },
  {
    id: "faq",
    label: "FAQ",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-48a12,12,0,1,0,12,12A12,12,0,0,0,128,168Zm0-96a32,32,0,0,0-32,32,8,8,0,0,0,16,0,16,16,0,1,1,25.6,12.8c-9.1,6.8-17.6,14.8-17.6,27.2v3.2a8,8,0,0,0,16,0V144c0-5.5,4.7-9.7,11.2-14.6A32,32,0,0,0,128,72Z" />
      </svg>
    ),
  },
  {
    id: "contact",
    label: "Kontakt",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M222.37,158.46l-48-20.57a16,16,0,0,0-18.57,4.72l-21.56,26.36A120.13,120.13,0,0,1,87,121.76L113.39,100.2a16,16,0,0,0,4.72-18.57l-20.57-48A16,16,0,0,0,79.68,24.6l-40,16A16,16,0,0,0,29,58.1C32.88,157.41,98.59,223.12,197.9,227a16,16,0,0,0,17.5-10.68l16-40A16,16,0,0,0,222.37,158.46Z" />
      </svg>
    ),
  },
  {
    id: "offers",
    label: "Erbjudanden",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path d="M232,120a8,8,0,0,0-8,8v56H88a8,8,0,0,0-5.66,2.34l-24,24A8,8,0,0,0,64,224H224a16,16,0,0,0,16-16V128A8,8,0,0,0,232,120ZM64,208l16-16H224v16ZM72,56a16,16,0,0,0-16,16v72a16,16,0,0,0,16,16h96a16,16,0,0,0,16-16V72a16,16,0,0,0-16-16Zm96,88H72V72h96Z" />
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
    href: isCompleted || isCheckedIn ? undefined : canCheckInEffective ? `/check-in?token=${token}` : undefined,
    disabled: isCompleted || (!isCheckedIn && !canCheckInEffective),
  };

  const tiles: Tile[] = [primary, ...DEFAULT_TILES.slice(1, 8)];

  return (
    <div style={{ padding: "17px 17px 24px 17px" }}>
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
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.06)",
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
    </div>
  );
}
