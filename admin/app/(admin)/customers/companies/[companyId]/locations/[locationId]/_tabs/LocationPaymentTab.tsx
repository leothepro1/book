import type { CompanyLocation, VaultedCard } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { listAvailableTerms } from "@/app/_lib/companies";
import {
  CreditLimitEditCard,
  DepositEditCard,
  PaymentTermsEditCard,
} from "../../../../_components/LocationEditCards";

/**
 * Betalning tab — three editable cards + a READ-ONLY saved-cards list.
 *
 * Vaulted cards arrive through the guest-facing checkout flow; admin never
 * creates or deletes them here in FAS 5. Payment-terms preview copy (the
 * worked examples from FAS 4) intentionally collapsed — the resolved
 * values now live in the respective edit-cards and the preview can
 * return with the order-creation UI in FAS 6.
 */
export async function LocationPaymentTab({
  tenantId,
  location,
}: {
  tenantId: string;
  location: CompanyLocation;
}) {
  const [cards, paymentTerms] = await Promise.all([
    prisma.vaultedCard.findMany({
      where: { tenantId, companyLocationId: location.id },
      orderBy: [{ createdAt: "desc" }],
    }),
    listAvailableTerms({ tenantId }),
  ]);

  return (
    <div
      className="co-grid"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}
    >
      <PaymentTermsEditCard
        companyId={location.companyId}
        location={location}
        options={paymentTerms.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
        }))}
      />
      <DepositEditCard companyId={location.companyId} location={location} />
      <CreditLimitEditCard companyId={location.companyId} location={location} />

      <section className="co-card">
        <h2 className="co-card__title">Sparade kort</h2>
        {cards.length === 0 ? (
          <p className="co-muted">Inga sparade kort</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {cards.map((card: VaultedCard) => (
              <li
                key={card.id}
                className="co-card__row"
                style={{ borderBottom: "1px solid rgba(0,0,0,.04)" }}
              >
                <span className="co-card__label">
                  {card.brand} •••• {card.last4}
                </span>
                <span className="co-card__value">
                  Utgår{" "}
                  {card.expMonth.toString().padStart(2, "0")}/
                  {card.expYear.toString().slice(-2)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="co-muted" style={{ marginTop: 8, fontSize: 12 }}>
          Sparade kort läggs till via gästens checkout. Borttagning kommer
          i en senare version.
        </p>
      </section>
    </div>
  );
}
