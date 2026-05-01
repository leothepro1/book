/**
 * Phase F — `/invoice/[token]` cancelled fork.
 *
 * Rendered when the draft has transitioned to `CANCELLED`. The
 * share-link itself is invariant 14 — immutable for the lifetime
 * of the draft — so a buyer who clicks an old email after the
 * merchant cancels still resolves to this page (rather than 404)
 * and gets clear guidance to contact the hotel.
 */

import {
  ContactBlock,
  buildPageStyles,
  minimalPageStyles,
  type TenantForStatusPage,
} from "./_shared";

export async function CancelledPage({
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
          data-i18n="invoice.cancelled.title"
        >
          Bokningen har avbokats
        </h1>
        <p style={minimalPageStyles.body} data-i18n="invoice.cancelled.body">
          Den här bokningen har avbokats. Kontakta hotellet om du har
          frågor.
        </p>
        <ContactBlock tenant={tenant} />
      </div>
    </div>
  );
}
