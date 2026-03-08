"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useUnsavedModal } from "./NavigationGuardContext";
import "./navigation-guard.css";

function Spinner() {
  return (
    <svg className="nav-guard-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function UnsavedChangesModal() {
  const { modal, handleSave, handleDiscard, handleCancel } = useUnsavedModal();
  const busy = modal.isSaving || modal.isDiscarding;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className={`nav-guard-overlay${modal.isOpen ? " nav-guard-overlay--open" : ""}`}
        onClick={busy ? undefined : handleCancel}
      />

      {/* Modal */}
      <div className={`nav-guard-modal${modal.isOpen ? " nav-guard-modal--open" : ""}`}>
        <div className="nav-guard-content" onClick={(e) => e.stopPropagation()}>
          <button
            className="nav-guard-close"
            onClick={handleCancel}
            disabled={busy}
            aria-label="Stäng"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
            </svg>
          </button>
          <h2 className="nav-guard-title">Vill du spara ändringarna?</h2>
          <p className="nav-guard-description">
            När du sparar visas de på din Bedfront.
          </p>

          <div className="nav-guard-actions">
            <button
              className="nav-guard-btn nav-guard-btn--save"
              onClick={handleSave}
              disabled={busy}
            >
              {modal.isSaving ? <Spinner /> : null}
              Spara ändringar
            </button>

            <button
              className="nav-guard-btn nav-guard-btn--discard"
              onClick={handleDiscard}
              disabled={busy}
            >
              {modal.isDiscarding ? <Spinner /> : null}
              Ignorera ändringar
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
