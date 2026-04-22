import Link from "next/link";
import { listLocationsForCompanyWithSummary } from "@/app/_lib/companies";
import { EmptyState } from "../../_components/EmptyState";
import { AddLocationForm } from "../../_components/AddLocationForm";
import { formatDateSv } from "../../_components/formatters";

export async function LocationsTab({
  tenantId,
  companyId,
}: {
  tenantId: string;
  companyId: string;
}) {
  // Single call — five batched queries inside the helper. No N+1.
  const locations = await listLocationsForCompanyWithSummary({
    tenantId,
    companyId,
  });

  if (locations.length === 0) {
    return (
      <div>
        <AddLocationForm companyId={companyId} />
        <EmptyState
          icon="location_on"
          title="Företaget har inga platser ännu"
          description="Använd formuläret ovan för att skapa den första platsen."
        />
      </div>
    );
  }

  return (
    <div>
      <AddLocationForm companyId={companyId} />
      <table className="co-table">
      <thead>
        <tr>
          <th>Namn</th>
          <th>Adress</th>
          <th className="co-table__numeric">Kontakter</th>
          <th>Betalningsvillkor</th>
          <th className="co-table__numeric">Kataloger</th>
          <th>Senaste order</th>
        </tr>
      </thead>
      <tbody>
        {locations.map((loc) => {
          const addr =
            (loc.billingAddress as Record<string, unknown> | null) ?? null;
          const city = typeof addr?.city === "string" ? addr.city : null;
          const country = typeof addr?.country === "string" ? addr.country : null;
          const addressDisplay =
            [city, country].filter(Boolean).join(", ") || "—";
          return (
            <tr key={loc.id}>
              <td>
                <Link
                  href={`/customers/companies/${companyId}/locations/${loc.id}`}
                >
                  {loc.name}
                </Link>
              </td>
              <td>{addressDisplay}</td>
              <td className="co-table__numeric">{loc.contactCount}</td>
              <td>
                {loc.paymentTermsName ?? <span className="co-muted">—</span>}
              </td>
              <td className="co-table__numeric">{loc.catalogCount}</td>
              <td>{formatDateSv(loc.lastOrderAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
