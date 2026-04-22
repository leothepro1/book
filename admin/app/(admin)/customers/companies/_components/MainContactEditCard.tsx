"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMainContactAction } from "../actions";

/**
 * Ändra huvudkontakt — picker over the company's existing contacts.
 *
 * Shows current main contact + lets staff promote any other contact. The
 * picker is a native <select> populated from `contacts` (loaded server-side
 * via listContactsForCompany and passed in as props). A combobox with
 * async search arrives when the guest picker does in a later phase.
 */

interface ContactOption {
  id: string;
  guestName: string;
  guestEmail: string;
  locationName: string;
  isMainContact: boolean;
}

export function MainContactEditCard({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: ContactOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string>(
    contacts.find((c) => c.isMainContact)?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = contacts.find((c) => c.isMainContact) ?? null;

  function save() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await setMainContactAction(companyId, selected);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="co-card co-card--editable">
      <div className="co-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="co-card__title" style={{ margin: 0 }}>Huvudkontakt</h2>
        {!editing && contacts.length > 0 ? (
          <button
            type="button"
            className="co-btn co-btn--ghost"
            onClick={() => setEditing(true)}
          >
            Ändra
          </button>
        ) : null}
      </div>
      <div className="co-card__body">
        {editing ? (
          <>
            <label className="co-field__label">Välj huvudkontakt</label>
            <select
              className="co-input"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.guestName || c.guestEmail} — {c.locationName}
                </option>
              ))}
            </select>
            {error ? (
              <div className="co-card__error" role="alert">
                {error}
              </div>
            ) : null}
          </>
        ) : current ? (
          <>
            <div className="co-card__row">
              <span className="co-card__label">Namn</span>
              <span className="co-card__value">{current.guestName || current.guestEmail}</span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">E-post</span>
              <span className="co-card__value">{current.guestEmail}</span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Plats</span>
              <span className="co-card__value">{current.locationName}</span>
            </div>
          </>
        ) : (
          <p className="co-muted">Ingen huvudkontakt är satt ännu.</p>
        )}
      </div>
      {editing ? (
        <div className="co-card__footer">
          <div className="co-card__footer-actions">
            <button
              type="button"
              className="co-btn co-btn--ghost"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Avbryt
            </button>
            <button
              type="button"
              className="co-btn co-btn--primary"
              onClick={save}
              disabled={busy || !selected}
            >
              {busy ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MainContactEmpty() {
  return (
    <section className="co-card">
      <h2 className="co-card__title">Huvudkontakt</h2>
      <p className="co-muted">
        Det finns inga kontakter på detta företag ännu. Gå till{" "}
        <Link href="?tab=platser">Platser</Link> och lägg till kontakter först.
      </p>
    </section>
  );
}
