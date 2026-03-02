import { BookingStatus } from "@prisma/client";
import type { Booking } from "@prisma/client";

type Props = {
  booking: Booking;
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

  // PRE_CHECKIN
  if (booking.status === BookingStatus.PRE_CHECKIN) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: "bold", lineHeight: "1.2em" }}>Incheckning från</div>
        <div style={{ opacity: mutedOpacity }}>
          {formatDateLongSv(arrival)} {checkInTime}
        </div>
      </div>
    );
  }

  // ACTIVE (checked in)
  if (booking.status === BookingStatus.ACTIVE) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: "bold", lineHeight: "1.2em" }}>Utcheckning senast</div>
        <div style={{ opacity: mutedOpacity }}>
          {formatDateLongSv(departure)} {checkOutTime}
        </div>
      </div>
    );
  }

  // COMPLETED (checked out)
  if (booking.status === BookingStatus.COMPLETED) {
    const out = booking.checkedOutAt ? new Date(booking.checkedOutAt) : null;

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: "bold", lineHeight: "1.2em" }}>Utcheckad</div>
        <div style={{ opacity: mutedOpacity }}>
          {out ? formatDateLongSv(out) : "—"}
        </div>
      </div>
    );
  }

  return null;
}
