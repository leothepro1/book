import type { Booking } from "@prisma/client";

export type { BookingStatus } from "@prisma/client";

export type BookingWithStatus = Pick<Booking, "id" | "status" | "checkedInAt" | "checkedOutAt" | "arrival" | "departure">;
