import Link from "next/link";
import type { CompanyLocation } from "@prisma/client";
import {
  getLocationOverviewBundle,
} from "@/app/_lib/companies";
import { MoneyCell } from "../../../../_components/MoneyCell";
import {
  AddressesEditCard,
  MetafieldsEditCard,
} from "../../../../_components/LocationEditCards";

/**
 * Location overview — bundled loader (FAS 5 UX-debt #4).
 *
 * Uses `getLocationOverviewBundle` which collapses the FAS 4 7-query shape
 * into ≤ 5 (1 upfront location + parallel company + paymentTerms + 3 stats).
 * The already-fetched `location` passed in by the page shell is reused so we
 * don't round-trip a second time.
 */
export async function LocationOverviewTab({
  tenantId,
  location,
}: {
  tenantId: string;
  location: CompanyLocation;
}) {
  const bundle = await getLocationOverviewBundle({
    tenantId,
    locationId: location.id,
  });
  // Page shell validated tenant scope already — falling back defensively
  // if the bundle shows a later-stage mismatch.
  const stats = bundle?.stats ?? {
    contactCount: 0,
    catalogCount: 0,
    pendingDraftCount: null,
    outstandingBalanceCents: BigInt(0),
  };
  const storeCredit =
    bundle?.storeCreditBalanceCents ?? location.storeCreditBalanceCents;
  const paymentTerms = bundle?.paymentTerms ?? null;
  const companyId = location.companyId;

  const checkoutModeLabel =
    location.checkoutMode === "AUTO_SUBMIT"
      ? "Direktorder"
      : "Kräver godkännande";

  return (
    <div className="co-grid co-grid--split">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AddressesEditCard companyId={companyId} location={location} />
        <MetafieldsEditCard companyId={companyId} location={location} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Snabbfakta remains READ-ONLY per FAS 5 spec — derived stats, no
            inline edit target. */}
        <section className="co-card">
          <h2 className="co-card__title">Snabbfakta</h2>
          <div className="co-card__row">
            <span className="co-card__label">Kontakter</span>
            <span className="co-card__value">{stats.contactCount}</span>
          </div>
          <div className="co-card__row">
            <span className="co-card__label">Tilldelade kataloger</span>
            <span className="co-card__value">{stats.catalogCount}</span>
          </div>
          <div className="co-card__row">
            <span className="co-card__label">Betalningsvillkor</span>
            <span className="co-card__value">
              {paymentTerms?.name ?? <span className="co-muted">Inga</span>}
            </span>
          </div>
          <div className="co-card__row">
            <span className="co-card__label">Deposit</span>
            <span className="co-card__value">
              {location.depositPercent > 0 ? (
                `${location.depositPercent}%`
              ) : (
                <span className="co-muted">—</span>
              )}
            </span>
          </div>
          <div className="co-card__row">
            <span className="co-card__label">Kreditlimit</span>
            <span className="co-card__value">
              {location.creditLimitCents !== null ? (
                <MoneyCell cents={location.creditLimitCents} />
              ) : (
                <span className="co-muted">Ingen limit</span>
              )}
            </span>
          </div>
          <div className="co-card__row">
            <span className="co-card__label">Checkout-läge</span>
            <span className="co-card__value">{checkoutModeLabel}</span>
          </div>
          <div className="co-card__row">
            <span className="co-card__label">Utkast för godkännande</span>
            <span className="co-card__value">
              {stats.pendingDraftCount === null ? (
                <span className="co-muted">—</span>
              ) : (
                stats.pendingDraftCount
              )}
            </span>
          </div>
        </section>

        {/* Store credit-saldo is READ-ONLY here; edits happen in the Store
            credit tab via the ledger-issue form. */}
        <section className="co-card">
          <h2 className="co-card__title">Store credit-saldo</h2>
          <div style={{ fontSize: 24, fontWeight: 600, margin: "4px 0 12px" }}>
            <MoneyCell
              cents={storeCredit}
              tone={storeCredit > BigInt(0) ? "positive" : "muted"}
            />
          </div>
          <Link
            href="?tab=store-credit"
            className="co-btn co-btn--ghost"
            style={{ display: "inline-flex" }}
          >
            Se transaktionshistorik
          </Link>
        </section>
      </div>
    </div>
  );
}
