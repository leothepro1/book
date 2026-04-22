"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createContactAction,
  removeContactAction,
  revokeAccessAction,
} from "../actions";
import { RadioGroup, TextField } from "./form-primitives";

/**
 * FAS 5.5: contact add/edit UI for a single CompanyLocation.
 *
 * Roles are gone — access is binary. Adding a contact creates a new
 * CompanyContact (or reuses an existing one if the guest is already a member
 * of this company) AND grants access to this location in one server call.
 *
 * Row actions offer "Ta bort från plats" (revoke access — keeps the contact
 * in the company, just removes this location) and "Ta bort kontakt" (delete
 * the CompanyContact entirely). Main-contact deletion is blocked on both
 * paths; admins must promote another contact first.
 */

export function AddContactForm({
  companyId,
  locationId,
}: {
  companyId: string;
  locationId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [guestId, setGuestId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("new");
    setGuestId("");
    setEmail("");
    setName("");
    setTitle("");
    setError(null);
  }

  function save() {
    if (mode === "existing" && !guestId.trim()) {
      setError("Gäst-ID krävs");
      return;
    }
    if (mode === "new") {
      if (!name.trim()) return setError("Namn krävs");
      if (!email.trim()) return setError("E-post krävs");
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await createContactAction({
        companyId,
        locationId,
        contact:
          mode === "existing"
            ? { guestAccountId: guestId.trim() }
            : { email: email.trim(), name: name.trim() },
        title: title.trim() || undefined,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          className="co-btn co-btn--primary"
          onClick={() => setOpen(true)}
        >
          + Lägg till kontakt
        </button>
      </div>
    );
  }

  return (
    <div className="co-inline-form" role="region" aria-label="Lägg till kontakt">
      <h3 className="co-card__title" style={{ marginTop: 0 }}>Ny kontakt</h3>
      {error ? (
        <div className="co-card__error" role="alert">{error}</div>
      ) : null}
      <RadioGroup
        label="Kontakt"
        value={mode}
        onChange={setMode}
        options={[
          { value: "new", label: "Skapa ny gäst" },
          { value: "existing", label: "Befintlig gäst (ange ID)" },
        ]}
      />
      {mode === "existing" ? (
        <TextField
          label="Gäst-ID"
          value={guestId}
          onChange={setGuestId}
          required
        />
      ) : (
        <>
          <TextField
            label="Namn"
            value={name}
            onChange={setName}
            required
          />
          <TextField
            label="E-post"
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
        </>
      )}
      <TextField
        label="Titel (valfri)"
        value={title}
        onChange={setTitle}
      />
      <div className="co-inline-form__actions">
        <button
          type="button"
          className="co-btn co-btn--ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
        >
          Avbryt
        </button>
        <button
          type="button"
          className="co-btn co-btn--primary"
          onClick={save}
          disabled={busy}
        >
          {busy ? "Lägger till…" : "Lägg till"}
        </button>
      </div>
    </div>
  );
}

export function ContactRowActions({
  companyId,
  locationId,
  contactId,
  guestName,
  isMainContact,
}: {
  companyId: string;
  locationId: string;
  contactId: string;
  guestName: string;
  isMainContact: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function revokeFromLocation() {
    if (!confirm(`Ta bort ${guestName} från denna plats?`)) return;
    setBusy(true);
    startTransition(async () => {
      const result = await revokeAccessAction({
        companyId,
        locationId,
        contactId,
      });
      setBusy(false);
      if (result.ok) router.refresh();
      else alert(result.error);
    });
  }

  function removeCompletely() {
    if (isMainContact) return;
    if (
      !confirm(
        `Ta bort ${guestName} som kontakt för företaget helt? Alla platsåtkomster tas också bort.`,
      )
    )
      return;
    setBusy(true);
    startTransition(async () => {
      const result = await removeContactAction({
        companyId,
        contactId,
        locationId,
      });
      setBusy(false);
      if (result.ok) router.refresh();
      else alert(result.error);
    });
  }

  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button
        type="button"
        className="co-btn co-btn--ghost"
        onClick={revokeFromLocation}
        disabled={busy || isMainContact}
        title={
          isMainContact
            ? "Huvudkontakten kan inte tas bort från sin plats — promotera en annan kontakt först."
            : undefined
        }
      >
        Ta bort från plats
      </button>
      <button
        type="button"
        className="co-btn co-btn--danger"
        onClick={removeCompletely}
        disabled={busy || isMainContact}
        title={
          isMainContact
            ? "Huvudkontakten kan inte raderas — promotera en annan kontakt först."
            : undefined
        }
      >
        Ta bort helt
      </button>
    </span>
  );
}
