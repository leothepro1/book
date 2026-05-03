"use client";

/**
 * BulkResultModal (FAS 7.8)
 * ─────────────────────────
 * Per-row outcome summary shown after a bulk action completes. Reuses
 * the canonical am-overlay/am-modal scaffold from FAS 7.2b.1
 * (AccommodationPickerModal / ConfirmModal) — no new modal CSS.
 *
 * Q5 (advisory): three sections (succeeded / skipped / failed). Empty
 * sections are hidden so a clean run shows only the success list.
 * "Försök igen för misslyckade" appears only when failed > 0 AND the
 * caller wired an `onRetryFailed` callback.
 */

import { useId } from "react";
import type { BulkActionResult } from "../actions";

interface BulkResultModalProps {
  open: boolean;
  result: BulkActionResult | null;
  /** Action label for the modal header — e.g. "Avbryt utkast". */
  actionLabel: string;
  onClose: () => void;
  /** When provided AND failed > 0, renders the secondary "retry failed" CTA. */
  onRetryFailed?: () => void;
}

export function BulkResultModal({
  open,
  result,
  actionLabel,
  onClose,
  onRetryFailed,
}: BulkResultModalProps) {
  const titleId = useId();

  if (!open || !result) return null;

  // ok=false is only emitted when tenant resolution failed — render a
  // simple error frame in that case.
  if (!result.ok) {
    return (
      <div
        className="am-overlay am-overlay--visible"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="am-modal" onClick={(e) => e.stopPropagation()}>
          <div className="am-modal__header">
            <h3 className="am-modal__title" id={titleId}>
              {actionLabel}
            </h3>
            <button
              type="button"
              className="am-modal__close"
              onClick={onClose}
              aria-label="Stäng"
            >
              ×
            </button>
          </div>
          <div className="am-modal__body">
            <p>{result.error}</p>
          </div>
          <div className="am-modal__footer">
            <button
              type="button"
              className="admin-btn admin-btn--accent"
              onClick={onClose}
            >
              Stäng
            </button>
          </div>
        </div>
      </div>
    );
  }

  const succeededCount = result.succeeded.length;
  const skippedCount = result.skipped.length;
  const failedCount = result.failed.length;

  const headerLine = `${actionLabel}: ${succeededCount} lyckade, ${skippedCount} skippade, ${failedCount} fel`;
  const showRetry = failedCount > 0 && onRetryFailed !== undefined;

  return (
    <div
      className="am-overlay am-overlay--visible"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        <div className="am-modal__header">
          <h3 className="am-modal__title" id={titleId}>
            {headerLine}
          </h3>
          <button
            type="button"
            className="am-modal__close"
            onClick={onClose}
            aria-label="Stäng"
          >
            ×
          </button>
        </div>

        <div className="am-modal__body">
          {succeededCount > 0 && (
            <section className="ord-bulk-result__section">
              <h4 className="ord-bulk-result__section-title">
                Lyckade ({succeededCount})
              </h4>
              <ul className="ord-bulk-result__list">
                {result.succeeded.map((row) => (
                  <li key={row.draftId} className="ord-bulk-result__row">
                    <span className="ord-bulk-result__row-id">
                      {row.displayNumber}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skippedCount > 0 && (
            <section className="ord-bulk-result__section">
              <h4 className="ord-bulk-result__section-title">
                Skippade ({skippedCount})
              </h4>
              <ul className="ord-bulk-result__list">
                {result.skipped.map((row) => (
                  <li key={row.draftId} className="ord-bulk-result__row">
                    <span className="ord-bulk-result__row-id">
                      {row.displayNumber}
                    </span>
                    <span className="ord-bulk-result__row-detail">
                      {row.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {failedCount > 0 && (
            <section className="ord-bulk-result__section">
              <h4 className="ord-bulk-result__section-title">
                Fel ({failedCount})
              </h4>
              <ul className="ord-bulk-result__list">
                {result.failed.map((row) => (
                  <li key={row.draftId} className="ord-bulk-result__row">
                    <span className="ord-bulk-result__row-id">
                      {row.displayNumber}
                    </span>
                    <span className="ord-bulk-result__row-detail">
                      {row.error}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="am-modal__footer">
          {showRetry && (
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={onRetryFailed}
            >
              Försök igen för misslyckade ({failedCount})
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn--accent"
            onClick={onClose}
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}
