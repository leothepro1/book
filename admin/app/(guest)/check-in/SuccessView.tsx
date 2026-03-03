"use client";
import { useRouter } from "next/navigation";
import SuccessLoader from "../_components/SuccessLoader";

type BookingInfo = {
  unit: string;
  arrivalISO: string;
  departureISO: string;
  heroImageUrl: string;
};

const dayNamesShort = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

function formatCompactDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dayNamesShort[d.getDay()]}, ${d.getDate()} ${monthNamesShort[d.getMonth()]} ${d.getFullYear()}`;
}

function ArrowRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: "#121212" }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M3.49951 10C3.49951 9.58579 3.8353 9.25 4.24951 9.25L13.9391 9.25L11.2192 6.53036C10.9263 6.23748 10.9263 5.7626 11.2192 5.4697C11.512 5.17679 11.9869 5.17676 12.2798 5.46964L16.2802 9.46964C16.4209 9.6103 16.4999 9.80107 16.4999 10C16.4999 10.1989 16.4209 10.3897 16.2802 10.5304L12.2798 14.5304C11.9869 14.8232 11.512 14.8232 11.2192 14.5303C10.9263 14.2374 10.9263 13.7625 11.2192 13.4696L13.9391 10.75L4.24951 10.75C3.8353 10.75 3.49951 10.4142 3.49951 10Z" fill="currentColor"></path>
    </svg>
  );
}

export default function SuccessView({
  nextHref,
  booking,
}: {
  nextHref: string;
  seconds?: number;
  booking?: BookingInfo;
}) {
  const router = useRouter();

  return (
    <div className="sektion73-success">
      <div className="sektion73-success__top">
        <div className="sektion73-success__title">Välkommen!</div>
        <div className="sektion73-success__body">Incheckningen är klar. Varmt välkommen!</div>
      </div>

      {booking && (
        <div className="booking-card" >
          <div
            className="booking-card__hero"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%), url("${booking.heroImageUrl || ""}")`,
            }}
          >
            <div className="booking-card__badge" style={{ background: "#fff", color: "#01A652", display: "flex", alignItems: "center", gap: 6 }}>
              <SuccessLoader size={26} color="#01A652" />
              Incheckad
            </div>
          </div>

          <div className="booking-card__content">
            <div className="booking-card__unit">{booking.unit || "Boende"}</div>
            <div className="booking-card__dates">
              <div className="booking-card__date">
                <div className="booking-card__date-label">Check-in</div>
                <div className="booking-card__date-value">{formatCompactDate(booking.arrivalISO)}</div>
              </div>
              <ArrowRightIcon />
              <div className="booking-card__date booking-card__date--right">
                <div className="booking-card__date-label">Check-out</div>
                <div className="booking-card__date-value">{formatCompactDate(booking.departureISO)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sektion73-success__spacer" />

      <div className="sektion73-cta" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          onClick={() => router.push(nextHref)}
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
}
