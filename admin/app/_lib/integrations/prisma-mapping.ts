/**
 * Prisma ↔ Normalized Status Mapping
 *
 * Single file that imports BookingStatus from @prisma/client.
 * All other code uses NormalizedBookingStatus and converts
 * at the DB boundary via these functions.
 */

import { BookingStatus as PrismaBookingStatus } from "@prisma/client";
import type { NormalizedBookingStatus } from "./types";

export function toPrismaBookingStatus(
  status: NormalizedBookingStatus
): PrismaBookingStatus {
  const map: Record<NormalizedBookingStatus, PrismaBookingStatus> = {
    upcoming: PrismaBookingStatus.PRE_CHECKIN,
    active: PrismaBookingStatus.ACTIVE,
    completed: PrismaBookingStatus.COMPLETED,
    cancelled: PrismaBookingStatus.CANCELLED,
  };
  return map[status];
}
