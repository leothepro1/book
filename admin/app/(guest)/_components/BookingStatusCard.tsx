import type { NormalizedBooking } from "@/app/_lib/integrations/types";

type Props = {
  booking: NormalizedBooking;
  mutedOpacity: number;
  checkInTime?: string;   // ex "14:00"
  checkOutTime?: string;  // ex "11:00"
};

function formatDateLongSv(d: Date) {
  // "24 februari" (utan år)
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "long",
  });
}

export default function BookingStatusCard({
  booking,
  mutedOpacity,
  checkInTime = "14:00",
  checkOutTime = "11:00",
}: Props) {
  const arrival = new Date(booking.arrival);
  const departure = new Date(booking.departure);

  // upcoming (PRE_CHECKIN)
  if (booking.status === "upcoming") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, lineHeight: "1.2em", fontFamily: "var(--font-heading)" }}>Incheckning från</div>
        <div style={{ opacity: mutedOpacity, fontFamily: "var(--font-body)", fontWeight: 400 }}>
          {formatDateLongSv(arrival)} {checkInTime}
        </div>
      </div>
    );
  }

  // active (checked in)
  if (booking.status === "active") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, lineHeight: "1.2em", fontFamily: "var(--font-heading)" }}>Utcheckning senast</div>
        <div style={{ opacity: mutedOpacity, fontFamily: "var(--font-body)", fontWeight: 400 }}>
          {formatDateLongSv(departure)} {checkOutTime}
        </div>
      </div>
    );
  }

  // completed (checked out)
  if (booking.status === "completed") {
    const out = booking.checkedOutAt ? new Date(booking.checkedOutAt) : null;

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, lineHeight: "1.2em", fontFamily: "var(--font-heading)" }}>Utcheckad</div>
        <div style={{ opacity: mutedOpacity, fontFamily: "var(--font-body)", fontWeight: 400 }}>
          {out ? formatDateLongSv(out) : "—"}
        </div>
      </div>
    );
  }

  return null;
}
