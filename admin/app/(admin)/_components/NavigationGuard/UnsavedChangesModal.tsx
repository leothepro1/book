"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useUnsavedModal } from "./NavigationGuardContext";
import "./navigation-guard.css";

function AnimatedSpinner({ visible, variant }: { visible: boolean; variant?: "dark" | "danger" }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;

  const cls = `nav-guard-spinner-animated${variant ? ` nav-guard-spinner-animated--${variant}` : ""}${animState === "exit" ? " nav-guard-spinner-animated--out" : ""}`;

  return (
    <svg
      className={cls}
      width="21" height="21" viewBox="0 0 21 21" fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
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
              <AnimatedSpinner visible={modal.isSaving} />
              <span className="nav-guard-btn-label">Spara ändringar</span>
            </button>

            <button
              className="nav-guard-btn nav-guard-btn--discard"
              onClick={handleDiscard}
              disabled={busy}
            >
              <AnimatedSpinner visible={modal.isDiscarding} variant="danger" />
              <span className="nav-guard-btn-label">Ignorera ändringar</span>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
