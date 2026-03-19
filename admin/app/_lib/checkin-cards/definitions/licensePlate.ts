import { registerCheckinCard } from "../registry";

registerCheckinCard({
  id: "licensePlate",
  label: "Registreringsnummer",
  icon: "directions_car",
  version: "1.0.0",
  optional: true,
  defaultEnabled: false,
  defaultSortOrder: 3,
});
