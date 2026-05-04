"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type Props = {
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
};

// SSR-safe gate for createPortal — server snapshot is false (no document),
// client snapshot is true. Replaces the cascading useState+useEffect
// "after-mount" pattern that triggered react-hooks/set-state-in-effect.
const subscribe = () => () => {};
const getServerSnapshot = () => false;
const getClientSnapshot = () => true;

export function SaveBar({ canSave, isSaving, onSave }: Props) {
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!mounted) return null;

  return createPortal(
    <div className="pf-footer">
      <button
        type="button"
        className="admin-btn admin-btn--accent"
        onClick={onSave}
        disabled={!canSave || isSaving}
      >
        {isSaving ? "Skapar order…" : "Skapa order"}
      </button>
    </div>,
    document.body,
  );
}
