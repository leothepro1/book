"use client";

import { useId, type ReactNode } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  /** Disables the confirm button on top of `isPending` — used by callers
   * that have a required field (e.g. FAS 7.6-lite reject reason). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Bekräfta",
  cancelLabel = "Avbryt",
  danger = false,
  isPending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  // useId must be called unconditionally; gate render below.
  const titleId = useId();

  if (!open) return null;

  return (
    <div
      className="am-overlay am-overlay--visible"
      onClick={() => {
        if (!isPending) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        <div className="am-modal__header">
          <h3 className="am-modal__title" id={titleId}>
            {title}
          </h3>
          <button
            type="button"
            className="am-modal__close"
            onClick={onCancel}
            aria-label="Stäng"
            disabled={isPending}
          >
            ×
          </button>
        </div>

        <div className="am-modal__body">
          {description && (
            <p style={{ marginTop: 0, marginBottom: 12, color: "var(--admin-text-muted)", fontSize: 14, lineHeight: 1.5 }}>
              {description}
            </p>
          )}
          {children}
        </div>

        <div className="am-modal__footer">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`admin-btn ${danger ? "admin-btn--danger" : "admin-btn--accent"}`}
            onClick={onConfirm}
            disabled={isPending || confirmDisabled}
            aria-busy={isPending}
          >
            {isPending ? "Bearbetar..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
