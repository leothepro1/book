"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import {
  getAccommodations,
  createSpotMap,
  activateSpotMap,
} from "@/app/_lib/apps/spot-booking/wizard-actions";
import type { AccommodationOption } from "@/app/_lib/apps/spot-booking/wizard-actions";
import type { WizardState } from "@/app/_lib/apps/types";
import "./spot-booking-wizard.css";

type Props = { wizardState: WizardState };

export function SpotBookingWizard({ wizardState }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Collected state
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageUrl, setImageUrl] = useState("");
  const [imagePublicId, setImagePublicId] = useState("");
  const [addonPriceSek, setAddonPriceSek] = useState(""); // displayed in SEK
  const [currency, setCurrency] = useState("SEK");
  const [spotMapId, setSpotMapId] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  const clearError = () => setError(null);
  const { app } = wizardState;

  // Load accommodations on mount
  useEffect(() => {
    let cancelled = false;
    getAccommodations().then((result) => {
      if (cancelled) return;
      if (result.ok) setAccommodations(result.data);
      else setError(result.error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const toggleAccommodation = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    clearError();
  };

  const addonPriceOre = Math.round(Number(addonPriceSek) * 100);

  switch (step) {
    case 1:
      return (
        <div className="sbw__layout">
          <div className="sbw__card">
            <Link href="/apps" style={{ textDecoration: "none" }}>
              <span className="sbw__back">
                <EditorIcon name="arrow_back" size={16} />
                App Store
              </span>
            </Link>

            <div className="sbw__step-badge">Steg 1 av 4</div>
            <h2 className="sbw__title">Valj boenden</h2>
            <p className="sbw__subtitle">
              Valj vilka boenden som ska visas pa kartan.
            </p>

            {error && (
              <div className="sbw__error">
                <EditorIcon name="error" size={18} />
                {error}
              </div>
            )}

            {loading ? (
              <div className="sbw__loading">
                <div className="sbw__spinner" />
                <span className="sbw__loading-text">Hamtar boenden...</span>
              </div>
            ) : accommodations.length === 0 ? (
              <div className="sbw__empty">
                Inga lediga boenden hittades. Skapa boenden under Boenden forst.
              </div>
            ) : (
              <div className="sbw__category-list">
                {accommodations.map((acc) => (
                  <div
                    key={acc.id}
                    className={`sbw__category-item${selectedIds.has(acc.id) ? " sbw__category-item--selected" : ""}`}
                    onClick={() => toggleAccommodation(acc.id)}
                  >
                    <span className="sbw__category-radio">
                      {selectedIds.has(acc.id) && <EditorIcon name="check" size={12} />}
                    </span>
                    <div>
                      <div className="sbw__category-name">{acc.name}</div>
                      {acc.categoryTitle && (
                        <div className="sbw__category-count">{acc.categoryTitle}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="sbw__footer">
              <button
                className="admin-btn admin-btn--accent"
                disabled={selectedIds.size === 0 || isPending}
                onClick={() => { clearError(); setStep(2); }}
              >
                Nasta
              </button>
            </div>
          </div>
        </div>
      );

    case 2:
      return (
        <div className="sbw__layout">
          <div className="sbw__card">
            <button className="sbw__back" onClick={() => { clearError(); setStep(1); }}>
              <EditorIcon name="arrow_back" size={16} />
              Tillbaka
            </button>

            <div className="sbw__step-badge">Steg 2 av 4</div>
            <h2 className="sbw__title">Ladda upp karta</h2>
            <p className="sbw__subtitle">
              Ladda upp en bild av ditt omrade. Det kan vara en oversiktsplan, satellitbild eller illustration.
            </p>

            {error && (
              <div className="sbw__error">
                <EditorIcon name="error" size={18} />
                {error}
              </div>
            )}

            {imageUrl ? (
              <div className="sbw__preview">
                <img src={imageUrl} alt="Kartforhandsvisning" />
                <button
                  className="sbw__preview-remove"
                  onClick={() => { setImageUrl(""); setImagePublicId(""); }}
                  title="Ta bort bild"
                >
                  <EditorIcon name="close" size={16} />
                </button>
              </div>
            ) : (
              <div className="sbw__upload-area" onClick={() => setMediaOpen(true)}>
                <div className="sbw__upload-icon">
                  <EditorIcon name="cloud_upload" size={40} />
                </div>
                <p className="sbw__upload-text">Klicka for att valja en bild</p>
                <p className="sbw__upload-hint">PNG, JPG eller SVG</p>
              </div>
            )}

            <MediaLibraryModal
              open={mediaOpen}
              onClose={() => setMediaOpen(false)}
              onConfirm={(asset: MediaLibraryResult) => {
                setImageUrl(asset.url);
                setImagePublicId(asset.publicId);
                setMediaOpen(false);
              }}
              uploadFolder="spot-maps"
              accept="image"
              title="Valj kartbild"
            />

            <div className="sbw__footer">
              <button
                className="admin-btn admin-btn--accent"
                disabled={!imageUrl || isPending}
                onClick={() => { clearError(); setStep(3); }}
              >
                Nasta
              </button>
            </div>
          </div>
        </div>
      );

    case 3:
      return (
        <div className="sbw__layout">
          <div className="sbw__card">
            <button className="sbw__back" onClick={() => { clearError(); setStep(2); }}>
              <EditorIcon name="arrow_back" size={16} />
              Tillbaka
            </button>

            <div className="sbw__step-badge">Steg 3 av 4</div>
            <h2 className="sbw__title">Satt pris</h2>
            <p className="sbw__subtitle">
              Ange tilllaggsavgiften en gast betalar for att valja en specifik plats.
            </p>

            {error && (
              <div className="sbw__error">
                <EditorIcon name="error" size={18} />
                {error}
              </div>
            )}

            <div className="sbw__price-field">
              <label className="sbw__price-label">Tilllaggsavgift</label>
              <div className="sbw__price-row">
                <input
                  type="number"
                  className="admin-input--sm sbw__price-input"
                  min="1"
                  step="1"
                  placeholder="50"
                  value={addonPriceSek}
                  onChange={(e) => { clearError(); setAddonPriceSek(e.target.value); }}
                />
                <span className="sbw__price-suffix">kr</span>
              </div>
              <span className="sbw__price-hint">
                Detta ar tilllaggsavgiften en gast betalar for att valja en specifik plats
              </span>
            </div>

            <div className="sbw__currency-field">
              <label className="sbw__currency-label">Valuta</label>
              <select
                className="admin-input--sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: 120 }}
              >
                <option value="SEK">SEK</option>
                <option value="EUR">EUR</option>
                <option value="NOK">NOK</option>
                <option value="DKK">DKK</option>
              </select>
            </div>

            <div className="sbw__footer">
              <button
                className="admin-btn admin-btn--accent"
                disabled={!addonPriceSek || addonPriceOre <= 0 || isPending}
                onClick={() => {
                  clearError();
                  if (addonPriceOre <= 0) {
                    setError("Priset maste vara storre an 0");
                    return;
                  }
                  startTransition(async () => {
                    const result = await createSpotMap({
                      accommodationIds: Array.from(selectedIds),
                      imageUrl,
                      imagePublicId,
                      addonPrice: addonPriceOre,
                      currency,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setSpotMapId(result.data.id);
                    setStep(4);
                  });
                }}
              >
                {isPending ? "Sparar..." : "Nasta"}
              </button>
            </div>
          </div>
        </div>
      );

    case 4:
      return (
        <div className="sbw__layout">
          <div className="sbw__card">
            <button className="sbw__back" onClick={() => { clearError(); setStep(3); }}>
              <EditorIcon name="arrow_back" size={16} />
              Tillbaka
            </button>

            <div className="sbw__step-badge">Steg 4 av 4</div>
            <h2 className="sbw__title">Granska och aktivera</h2>
            <p className="sbw__subtitle">
              Kontrollera dina installningar innan appen aktiveras.
            </p>

            {error && (
              <div className="sbw__error">
                <EditorIcon name="error" size={18} />
                {error}
              </div>
            )}

            <div className="sbw__summary">
              <div className="sbw__summary-row">
                <span className="sbw__summary-key">Boenden</span>
                <span className="sbw__summary-value">{selectedIds.size} valda</span>
              </div>

              <div className="sbw__summary-image">
                <img src={imageUrl} alt="Kartbild" />
              </div>

              <div className="sbw__summary-row">
                <span className="sbw__summary-key">Tilllaggsavgift</span>
                <span className="sbw__summary-value">
                  {addonPriceSek} {currency}
                </span>
              </div>
            </div>

            <div className="sbw__note">
              Du kan lagga till platser pa kartan efter aktivering.
            </div>

            <div className="sbw__footer">
              <button
                className="admin-btn admin-btn--accent"
                disabled={isPending || !spotMapId}
                onClick={() => {
                  clearError();
                  startTransition(async () => {
                    const result = await activateSpotMap(spotMapId!);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    router.push(`/apps/${app.id}?installed=1`);
                  });
                }}
              >
                {isPending ? "Aktiverar..." : `Aktivera ${app.name}`}
              </button>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
