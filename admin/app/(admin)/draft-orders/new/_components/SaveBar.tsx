"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
};

export function SaveBar({ canSave, isSaving, onSave }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
