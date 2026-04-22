import { listContactsForCompany } from "@/app/_lib/companies";
import type { Company } from "@prisma/client";
import { MetafieldsViewer } from "../../_components/MetafieldsViewer";
import { CompanyInfoEditCard } from "../../_components/CompanyInfoEditCard";
import {
  MainContactEditCard,
  MainContactEmpty,
} from "../../_components/MainContactEditCard";

/**
 * Eager overview tab — the default landing for company detail.
 *
 * Snabbfakta-baren ovanför pf-body renderas i page.tsx (matchar kund-sidans
 * `.cst-overview`-mönster). Denna vy har bara företagsuppgifter, huvudkontakt
 * och metafields.
 */
export async function OverviewTab({
  tenantId,
  company,
}: {
  tenantId: string;
  company: Company;
}) {
  const allContacts = await listContactsForCompany({
    tenantId,
    companyId: company.id,
  });

  // A contact's "primary location" is the first of the locations they have
  // access to — shown alongside the name in the picker so staff know which
  // site the contact actually works at.
  const contactOptions = allContacts.map((c) => ({
    id: c.id,
    guestName:
      c.guestAccount.name ??
      [c.guestAccount.firstName, c.guestAccount.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ??
      "",
    guestEmail: c.guestAccount.email,
    locationName:
      c.locationAccess[0]?.companyLocation.name ?? "Ingen plats",
    isMainContact: c.id === company.mainContactId,
  }));

  return (
    <div className="co-grid co-grid--split">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CompanyInfoEditCard company={company} />
        {contactOptions.length > 0 ? (
          <MainContactEditCard
            companyId={company.id}
            contacts={contactOptions}
          />
        ) : (
          <MainContactEmpty />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="co-card">
          <h2 className="co-card__title">Metafields</h2>
          <MetafieldsViewer metafields={company.metafields} />
        </section>
      </div>
    </div>
  );
}
