export type StayPhase = "pre_arrival" | "during" | "checkout_day" | "post_checkout";
export type RuleBookingStatus = "booked" | "checked_in" | "checked_out" | "cancelled";

export type VisibilityRule = {
  id: string;
  name: string;
  isEnabled: boolean;

  phases?: StayPhase[];
  statuses?: RuleBookingStatus[];
  daysBeforeArrivalMax?: number;
};
