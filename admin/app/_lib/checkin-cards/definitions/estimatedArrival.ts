import { registerCheckinCard } from "../registry";

registerCheckinCard({
  id: "estimatedArrival",
  label: "Beräknad ankomsttid",
  icon: "schedule",
  version: "1.0.0",
  optional: true,
  defaultEnabled: false,
  defaultSortOrder: 6,
});
