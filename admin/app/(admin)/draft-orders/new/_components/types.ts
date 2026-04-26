import type {
  AccommodationSearchResult,
  AvailabilityResult,
} from "@/app/_lib/draft-orders";

export type LocalLineItem = {
  tempId: string;
  accommodation: AccommodationSearchResult;
  fromDate: Date;
  toDate: Date;
  guestCount: number;
  availability?: AvailabilityResult;
  isCheckingAvailability: boolean;
};

export function generateTempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
