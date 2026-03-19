import { registerCheckinCard } from "../registry";

registerCheckinCard({
  id: "purposeOfStay",
  label: "Syfte med vistelsen",
  icon: "travel_explore",
  version: "1.0.0",
  optional: true,
  defaultEnabled: false,
  defaultSortOrder: 4,
});
