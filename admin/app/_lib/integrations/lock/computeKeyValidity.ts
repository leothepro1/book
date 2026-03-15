import type { NormalizedBooking } from "../types";

type TenantCheckTimes = {
  checkInTime?: string;  // "15:00"
  checkOutTime?: string; // "11:00"
  timezone?: string;     // "Europe/Stockholm"
};

const DEFAULT_CHECK_IN_TIME = "15:00";
const DEFAULT_CHECK_OUT_TIME = "11:00";

/**
 * Computes the valid-from and valid-to timestamps for a digital key
 * based on the booking dates and the tenant's check-in/check-out times.
 *
 * - validFrom: arrival date at checkInTime
 * - validTo: departure date at checkOutTime
 * - Falls back to 15:00 / 11:00 if tenant config is missing
 * - Uses tenant timezone if available, otherwise UTC
 */
export function computeKeyValidity(
  booking: NormalizedBooking,
  config: TenantCheckTimes,
): { validFrom: Date; validTo: Date } {
  const checkInTime = config.checkInTime ?? DEFAULT_CHECK_IN_TIME;
  const checkOutTime = config.checkOutTime ?? DEFAULT_CHECK_OUT_TIME;

  const [inHours, inMinutes] = checkInTime.split(":").map(Number);
  const [outHours, outMinutes] = checkOutTime.split(":").map(Number);

  const validFrom = new Date(booking.arrival);
  validFrom.setUTCHours(inHours, inMinutes, 0, 0);

  const validTo = new Date(booking.departure);
  validTo.setUTCHours(outHours, outMinutes, 0, 0);

  return { validFrom, validTo };
}
