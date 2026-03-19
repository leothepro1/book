import { registerCheckinCard } from "../registry";

registerCheckinCard({
  id: "phone",
  label: "Telefonnummer",
  icon: "phone",
  version: "1.0.0",
  optional: true,
  defaultEnabled: false,
  defaultSortOrder: 1,
});
