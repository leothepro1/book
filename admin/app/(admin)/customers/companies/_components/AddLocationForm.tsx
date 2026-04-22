"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLocationAction } from "../actions";
import {
  AddressField,
  TextField,
  ToggleField,
  type Address,
} from "./form-primitives";

export function AddLocationForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [billing, setBilling] = useState<Address>({ country: "SE" });
  const [sameShipping, setSameShipping] = useState(true);
  const [shipping, setShipping] = useState<Address>({ country: "SE" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setExternalId("");
    setBilling({ country: "SE" });
    setSameShipping(true);
    setShipping({ country: "SE" });
    setError(null);
  }

  function save() {
    if (!name.trim()) {
      setError("Platsnamn krävs");
      return;
    }
    if (!billing.line1 || !billing.city || !billing.postalCode) {
      setError("Fullständig faktureringsadress krävs");
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await createLocationAction({
        companyId,
        name: name.trim(),
        externalId: externalId.trim() || undefined,
        billingAddress: { ...billing } as Record<string, unknown>,
        shippingAddress: sameShipping
          ? undefined
          : ({ ...shipping } as Record<string, unknown>),
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
          + Lägg till plats
        </button>
      </div>
    );
  }

  return (
    <div className="co-inline-form" role="region" aria-label="Lägg till plats">
      <h3 className="co-card__title" style={{ marginTop: 0 }}>Ny plats</h3>
      {error ? (
        <div className="co-card__error" role="alert">{error}</div>
      ) : null}
      <TextField
        label="Platsnamn"
        value={name}
        onChange={setName}
        required
        disabled={busy}
        autoFocus
      />
      <TextField
        label="Externt plats-ID"
        value={externalId}
        onChange={setExternalId}
        disabled={busy}
      />
      <AddressField
        label="Faktureringsadress"
        value={billing}
        onChange={setBilling}
        required
      />
      <ToggleField
        label="Samma leveransadress som fakturering"
        value={sameShipping}
        onChange={setSameShipping}
      />
      {!sameShipping ? (
        <AddressField
          label="Leveransadress"
          value={shipping}
          onChange={setShipping}
        />
      ) : null}
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
          {busy ? "Skapar…" : "Skapa plats"}
        </button>
      </div>
    </div>
  );
}
