import type { CompanyLocation } from "@prisma/client";
import { TaxEditCard } from "../../../../_components/LocationEditCards";

export function LocationTaxTab({ location }: { location: CompanyLocation }) {
  return (
    <div
      className="co-grid"
      style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
    >
      <TaxEditCard companyId={location.companyId} location={location} />
    </div>
  );
}
