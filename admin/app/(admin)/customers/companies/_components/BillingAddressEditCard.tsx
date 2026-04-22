"use client";

/**
 * BillingAddressEditCard — förifyllda inputs som matchar /new:s
 * Faktureringsadress-kort exakt. Sparar via updateLocationAction.
 *
 * Layout: samma pf-card-header / pf-card-title / pf-field / admin-label /
 * email-sender__input som /new — ingen skillnad på CSS, padding eller
 * fält-ordning. Skillnaden: här finns en "Spara"-knapp per kort som visas
 * när något ändrats.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { updateLocationAction } from "../actions";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

interface Props {
  companyId: string;
  locationId: string;
  initial: {
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
    country: string;
  };
}

export function BillingAddressEditCard({ companyId, locationId, initial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [line1, setLine1] = useState(initial.line1);
  const [line2, setLine2] = useState(initial.line2);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState(initial.country);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dirty när något fält skiljer sig från initial.
  const dirty =
    line1 !== initial.line1 ||
    line2 !== initial.line2 ||
    postalCode !== initial.postalCode ||
    city !== initial.city ||
    country !== initial.country;

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  function save() {
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await updateLocationAction({
        companyId,
        locationId,
        patch: {
          billingAddress: {
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            postalCode: postalCode.trim(),
            city: city.trim(),
            country: country.trim() || "SE",
          } as Record<string, unknown>,
        },
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
      router.refresh();
    });
  }

  function discard() {
    setLine1(initial.line1);
    setLine2(initial.line2);
    setPostalCode(initial.postalCode);
    setCity(initial.city);
    setCountry(initial.country);
    setError(null);
  }

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Faktureringsadress</span>
      </div>

      <div className="pf-field">
        <label className="admin-label">Gatuadress</label>
        <input
          type="text"
          className="email-sender__input"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
        />
      </div>

      <div className="pf-field">
        <label className="admin-label">Adresstillägg</label>
        <input
          type="text"
          className="email-sender__input"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
          placeholder="Valfritt"
        />
      </div>

      <div
        className="pf-field"
        style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
      >
        <div style={{ flex: 1 }}>
          <label className="admin-label">Postnummer</label>
          <input
            type="text"
            className="email-sender__input"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
        </div>
        <div style={{ flex: 2 }}>
          <label className="admin-label">Ort</label>
          <input
            type="text"
            className="email-sender__input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
      </div>

      <div className="pf-field" style={{ marginBottom: dirty || savedAt ? 12 : 0 }}>
        <label className="admin-label">Land</label>
        <input
          type="text"
          className="email-sender__input"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="SE"
        />
      </div>

      {error && (
        <div className="pf-error-banner" style={{ margin: "0 0 12px 0" }}>
          <EditorIcon name="error" size={16} />
          <span>{error}</span>
          <button
            type="button"
            className="pf-error-banner__close"
            onClick={() => setError(null)}
          >
            <EditorIcon name="close" size={14} />
          </button>
        </div>
      )}

      {(dirty || savedAt) && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            paddingTop: 4,
          }}
        >
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            style={{ padding: "5px 12px", borderRadius: 8 }}
            onClick={discard}
            disabled={saving}
          >
            Avbryt
          </button>
          <button
            type="button"
            className={`admin-btn admin-btn--accent${savedAt ? " admin-btn--done" : ""}`}
            style={{ padding: "5px 12px", borderRadius: 8 }}
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Sparar…" : savedAt ? "Sparat ✓" : "Spara"}
          </button>
        </div>
      )}
    </div>
  );
}
