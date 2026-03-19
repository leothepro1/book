import { registerCheckinCard } from "../registry";

registerCheckinCard({
  id: "guestCount",
  label: "Antal gäster",
  icon: "group",
  version: "1.0.0",
  optional: true,
  defaultEnabled: false,
  defaultSortOrder: 2,
});
