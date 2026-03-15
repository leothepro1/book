import type { NormalizedBooking, NormalizedBookingStatus } from "@/app/_lib/integrations/types";

export type { NormalizedBookingStatus as BookingStatus } from "@/app/_lib/integrations/types";

export type BookingWithStatus = Pick<
  NormalizedBooking,
  "externalId" | "status" | "checkedInAt" | "checkedOutAt" | "arrival" | "departure"
>;
