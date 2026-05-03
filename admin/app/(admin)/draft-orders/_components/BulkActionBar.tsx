"use client";

/**
 * BulkActionBar (FAS 7.8)
 * ───────────────────────
 * Sticky bottom bar that appears when one or more rows are selected on
 * `/draft-orders`. Renders the three V1 bulk actions (cancel /
 * send-invoice / resend-invoice) plus a left-side selection summary
 * with a "Avmarkera"-link.
 *
 * Q1 (advisory): all action buttons are always visible. Pre-condition
 * gating happens server-side per row — operators see the buttons even
 * when nothing in the current selection matches, so the affordance is
 * stable.
 *
 * Q4 (advisory): during a bulk run, all buttons + the clear-link are
 * disabled and (when a `progress` prop is provided) the bar shows
 * inline "Bearbetar X av Y…" text. No full-page spinner — the operator
 * keeps interacting with the list.
 */

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onSendInvoice: () => void;
  onResendInvoice: () => void;
  onCancel: () => void;
  pending: boolean;
  /** Inline "Bearbetar X av Y…" text shown during the pending phase. */
  progress?: { current: number; total: number } | null;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onSendInvoice,
  onResendInvoice,
  onCancel,
  pending,
  progress = null,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  const countLabel = `${selectedCount} ${
    selectedCount === 1 ? "vald" : "valda"
  }`;
  const showProgress = pending && progress !== null;

  return (
    <div
      className="ord-bulk-bar"
      role="region"
      aria-label="Bulk-åtgärder"
      aria-live="polite"
    >
      <div className="ord-bulk-bar__summary">
        <span className="ord-bulk-bar__count">{countLabel}</span>
        <button
          type="button"
          className="ord-bulk-bar__clear"
          onClick={onClearSelection}
          disabled={pending}
        >
          Avmarkera
        </button>
        {showProgress && (
          <span className="ord-bulk-bar__progress">
            Bearbetar {progress.current} av {progress.total}…
          </span>
        )}
      </div>

      <div className="ord-bulk-bar__actions">
        <button
          type="button"
          className="ord-bulk-btn ord-bulk-btn--accent"
          onClick={onSendInvoice}
          disabled={pending}
        >
          Skicka faktura
        </button>
        <button
          type="button"
          className="ord-bulk-btn"
          onClick={onResendInvoice}
          disabled={pending}
        >
          Skicka om faktura
        </button>
        <button
          type="button"
          className="ord-bulk-btn ord-bulk-btn--danger"
          onClick={onCancel}
          disabled={pending}
        >
          Avbryt utkast
        </button>
      </div>
    </div>
  );
}
