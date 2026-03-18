"use client";

import { createContext, useContext, useMemo } from "react";
import type { NormalizedBooking } from "@/app/_lib/integrations/types";

interface BookingsData {
  currentBookings: NormalizedBooking[];
  previousBookings: NormalizedBooking[];
}

const EMPTY: NormalizedBooking[] = [];

const BookingsContext = createContext<BookingsData>({
  currentBookings: EMPTY,
  previousBookings: EMPTY,
});

export function BookingsProvider({
  currentBookings,
  previousBookings,
  children,
}: BookingsData & { children: React.ReactNode }) {
  const stable = useMemo(
    () => ({
      currentBookings: currentBookings.length > 0 ? currentBookings : EMPTY,
      previousBookings: previousBookings.length > 0 ? previousBookings : EMPTY,
    }),
    [currentBookings, previousBookings],
  );

  return <BookingsContext.Provider value={stable}>{children}</BookingsContext.Provider>;
}

export function useBookings(): BookingsData {
  return useContext(BookingsContext);
}
