import { registerCheckinCard } from "../registry";

registerCheckinCard({
  id: "idVerification",
  label: "Legitimation",
  icon: "badge",
  version: "1.0.0",
  optional: true,
  defaultEnabled: false,
  defaultSortOrder: 5,
});
