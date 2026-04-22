import Link from "next/link";
import { listContactsWithAccessToLocation } from "@/app/_lib/companies";
import { EmptyState } from "../../../../_components/EmptyState";
import { formatDateSv } from "../../../../_components/formatters";
import {
  AddContactForm,
  ContactRowActions,
} from "../../../../_components/LocationContactEditor";

/**
 * FAS 5.5: shows every CompanyContact with a CompanyLocationAccess to this
 * location. Roles are gone — the table shows: name, email, main-contact flag,
 * when the access was granted, and row actions (revoke access + remove).
 */
export async function LocationContactsTab({
  tenantId,
  locationId,
  companyId,
}: {
  tenantId: string;
  locationId: string;
  companyId: string;
}) {
  const rows = await listContactsWithAccessToLocation({
    tenantId,
    companyLocationId: locationId,
  });

  return (
    <div>
      <AddContactForm companyId={companyId} locationId={locationId} />
      {rows.length === 0 ? (
        <EmptyState
          icon="person_add_disabled"
          title="Inga kontakter"
          description="Använd formuläret ovan för att lägga till den första kontakten."
        />
      ) : (
        <table className="co-table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Email</th>
              <th>Huvudkontakt</th>
              <th>Tillagd</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const g = row.companyContact.guestAccount;
              const name =
                g.name ??
                [g.firstName, g.lastName].filter(Boolean).join(" ").trim() ??
                g.email;
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={`/customers/${g.id}`}>{name}</Link>
                  </td>
                  <td>{g.email}</td>
                  <td>
                    {row.companyContact.isMainContact ? (
                      <span
                        className="material-symbols-rounded"
                        aria-label="Huvudkontakt"
                        title="Huvudkontakt"
                        style={{ fontSize: 18, color: "#065F46" }}
                      >
                        check_circle
                      </span>
                    ) : (
                      <span className="co-muted">—</span>
                    )}
                  </td>
                  <td>{formatDateSv(row.createdAt)}</td>
                  <td>
                    <ContactRowActions
                      companyId={companyId}
                      locationId={locationId}
                      contactId={row.companyContact.id}
                      guestName={name}
                      isMainContact={row.companyContact.isMainContact}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
