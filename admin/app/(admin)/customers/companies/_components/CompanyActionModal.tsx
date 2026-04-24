"use client";

/**
 * CompanyActionModal — shared shell for every action opened from the
 * CompanyMetaCard overflow menu (Redigera företagsuppgifter, Lägg till
 * kund, Byt huvudkontakt, Ta bort kund).
 *
 * Responsibilities:
 *   - Reuses the Modal primitive (focus trap, portal, stacking, ESC,
 *     backdrop animation) so every action modal behaves identically.
 *   - Adds a standardized footer: Avbryt (ghost) + Spara (accent, disabled
 *     until `canSave` is true). Spara also disables while `isSaving`.
 *   - Renders an optional error banner above the body content.
 *
 * Visual identity is fixed. The only thing that differs between actions
 * is `children` — the body content.
 */

import type { ReactNode } from "react";
import { Modal, type ModalSize } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Save button is active only when canSave is true AND not already saving. */
  canSave: boolean;
  isSaving?: boolean;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  /** Visual intent of the Save button. `"accent"` is the default blue
   * affirmative; `"danger"` renders red for destructive actions like
   * removing a contact. */
  saveVariant?: "accent" | "danger";
  size?: ModalSize;
  /** Optional Swedish error message shown above the body content. */
  errorMessage?: string | null;
  children: ReactNode;
}

export function CompanyActionModal({
  open,
  onClose,
  title,
  canSave,
  isSaving = false,
  onSave,
  saveLabel = "Spara",
  cancelLabel = "Avbryt",
  saveVariant = "accent",
  size = "md",
  errorMessage = null,
  children,
}: Props) {
  const saveDisabled = !canSave || isSaving;
  const saveActiveClass =
    saveVariant === "danger" ? "admin-btn--danger" : "admin-btn--accent";

  return (
    <Modal
      open={open}
      onClose={isSaving ? () => {} : onClose}
      title={title}
      size={size}
      dismissible={!isSaving}
      footer={
        <>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            style={{ padding: "5px 10px", borderRadius: 8 }}
            onClick={onClose}
            disabled={isSaving}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`admin-btn${saveDisabled ? "" : ` ${saveActiveClass}`}`}
            style={{ padding: "5px 10px", borderRadius: 8 }}
            onClick={onSave}
            disabled={saveDisabled}
          >
            {isSaving ? "Sparar…" : saveLabel}
          </button>
        </>
      }
    >
      {errorMessage ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "#FEE2E2",
            color: "#991B1B",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {errorMessage}
        </div>
      ) : null}
      {children}
    </Modal>
  );
}
