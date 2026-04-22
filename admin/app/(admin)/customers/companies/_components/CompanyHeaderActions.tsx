"use client";

/**
 * Header write actions for a Company detail page — drops in where FAS 4
 * left `<div data-fas5-actions>`. Mirrors the products header-right layout:
 *
 *   primary/secondary status toggle (Arkivera / Återställ)
 *   "Fler åtgärder" overflow menu with disabled v1 items
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyStatus } from "@prisma/client";
import {
  archiveCompanyAction,
  unarchiveCompanyAction,
} from "../actions";

export function CompanyHeaderActions({
  companyId,
  companyName,
  status,
}: {
  companyId: string;
  companyName: string;
  status: CompanyStatus;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the overflow menu on outside click — mirrors products pattern.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function handleArchive() {
    if (
      !confirm(
        `Vill du arkivera "${companyName}"? Företaget döljs från standardlistan men kan återställas.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await archiveCompanyAction(companyId);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
        return;
      }
      router.refresh();
    });
  }

  function handleUnarchive() {
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await unarchiveCompanyAction(companyId);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="pf-header__actions">
      {error ? (
        <span className="co-flash co-flash--error" style={{ margin: 0, padding: "6px 10px" }}>
          {error}
        </span>
      ) : null}
      {status === "ARCHIVED" ? (
        <button
          type="button"
          className="co-btn co-btn--primary"
          onClick={handleUnarchive}
          disabled={busy}
        >
          {busy ? "Återställer…" : "Återställ"}
        </button>
      ) : (
        <button
          type="button"
          className="co-btn co-btn--ghost"
          onClick={handleArchive}
          disabled={busy}
        >
          {busy ? "Arkiverar…" : "Arkivera"}
        </button>
      )}
      <div className="co-actions-menu" ref={menuRef}>
        <button
          type="button"
          className="co-actions-menu__toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          Fler åtgärder
          <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>
            expand_more
          </span>
        </button>
        {menuOpen ? (
          <div className="co-actions-menu__list" role="menu">
            <button
              type="button"
              role="menuitem"
              className="co-actions-menu__item"
              disabled
              title="Exporter kommer i en senare version"
            >
              Exportera CSV (kommer snart)
            </button>
            <button
              type="button"
              role="menuitem"
              className="co-actions-menu__item co-actions-menu__item--danger"
              disabled
              title="Permanent borttagning kommer i en senare version. Arkivera i stället."
            >
              Radera företag (inaktiverat)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
