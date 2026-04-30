/**
 * Phase F — `/invoice/[token]` expired fork.
 *
 * Rendered when the share-link is structurally dead: the draft is
 * INVOICED with `expiresAt` past, OVERDUE (per invariant 15), or a
 * fresh-checkout race has crossed `expiresAt`. The buyer cannot
 * recover this state on their own — only the merchant can re-issue
 * an invoice — so the only CTA is contact info.
 */

import {
  ContactBlock,
  buildPageStyles,
  minimalPageStyles,
  type TenantForStatusPage,
} from "./_shared";

export async function ExpiredPage({
  tenant,
}: {
  tenant: TenantForStatusPage;
}) {
  const pageStyles = await buildPageStyles(tenant.id);

  return (
    <div style={{ ...minimalPageStyles.outer, ...pageStyles }}>
      <div style={minimalPageStyles.card}>
        <h1 style={minimalPageStyles.title} data-i18n="invoice.expired.title">
          Länken har gått ut
        </h1>
        <p style={minimalPageStyles.body} data-i18n="invoice.expired.body">
          Den här betalningslänken är inte längre giltig. Kontakta
          hotellet om du behöver en ny länk.
        </p>
        <ContactBlock tenant={tenant} />
      </div>
    </div>
  );
}
