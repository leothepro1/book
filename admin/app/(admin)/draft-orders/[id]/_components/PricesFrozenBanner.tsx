/**
 * Informational banner shown on /draft-orders/[id]/konfigurera when the
 * draft has `pricesFrozenAt` set (invoice has been sent). Lock state is
 * advisory in the UI — the actual write-blocking happens in the discount
 * service (`assertDraftMutable` rejects when pricesFrozenAt !== null).
 *
 * Stateless. Wired into KonfigureraClient in 7.2b.4b.2.
 */

export function PricesFrozenBanner() {
  return (
    <div className="pf-info-banner" role="status">
      <span
        className="material-symbols-outlined pf-info-banner__icon"
        aria-hidden="true"
      >
        lock
      </span>
      <span className="pf-info-banner__text">
        Priserna är låsta sedan fakturan skickades. Rader och rabatt kan inte
        ändras.
      </span>
    </div>
  );
}
