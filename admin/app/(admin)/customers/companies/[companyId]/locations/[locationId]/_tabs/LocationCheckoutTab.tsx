import type { CompanyLocation } from "@prisma/client";
import { CheckoutEditCard } from "../../../../_components/LocationEditCards";

export function LocationCheckoutTab({
  location,
}: {
  location: CompanyLocation;
}) {
  return (
    <div
      className="co-grid"
      style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
    >
      <CheckoutEditCard companyId={location.companyId} location={location} />
    </div>
  );
}
