/**
 * Phase F — `/invoice/[token]` unit-unavailable fork.
 *
 * Rendered when Phase E's `createDraftCheckoutSession` returns
 * `kind: "unit_unavailable"` — i.e. the PMS hold pipeline (§7.3
 * step 3) failed because the underlying accommodation is no
 * longer available. The buyer can't proceed; only the merchant
 * can resolve by editing the draft (which would unlink anyway).
 */

import {
  ContactBlock,
  buildPageStyles,
  minimalPageStyles,
  type TenantForStatusPage,
} from "./_shared";

export async function UnitUnavailablePage({
  tenant,
}: {
  tenant: TenantForStatusPage;
}) {
  const pageStyles = await buildPageStyles(tenant.id);

  return (
    <div style={{ ...minimalPageStyles.outer, ...pageStyles }}>
      <div style={minimalPageStyles.card}>
        <h1
          style={minimalPageStyles.title}
          data-i18n="invoice.unit_unavailable.title"
        >
          Boendet är inte längre tillgängligt
        </h1>
        <p
          style={minimalPageStyles.body}
          data-i18n="invoice.unit_unavailable.body"
        >
          Tyvärr är det boende du försökte boka inte längre tillgängligt.
          Kontakta hotellet för alternativ.
        </p>
        <ContactBlock tenant={tenant} />
      </div>
    </div>
  );
}
