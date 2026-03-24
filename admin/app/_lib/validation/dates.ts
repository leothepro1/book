/**
 * Stay Date Validation
 * ════════════════════
 *
 * Shared date validation for all checkout/booking/availability routes.
 * Single source of truth — never duplicate date logic.
 */

type DateValidResult =
  | { valid: true; nights: number; checkIn: Date; checkOut: Date }
  | { valid: false; error: string };

export function validateStayDates(checkIn: string, checkOut: string): DateValidResult {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);

  if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
    return { valid: false, error: "Ogiltiga datum" };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (inDate < now) {
    return { valid: false, error: "Incheckning kan inte vara i det förflutna" };
  }

  const nights = Math.round(
    (outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (nights < 1) {
    return { valid: false, error: "Utcheckning måste vara efter incheckning" };
  }

  if (nights > 365) {
    return { valid: false, error: "Vistelse kan inte överstiga 365 nätter" };
  }

  return { valid: true, nights, checkIn: inDate, checkOut: outDate };
}
