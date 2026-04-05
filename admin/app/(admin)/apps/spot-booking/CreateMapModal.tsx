"use client";

import { useState, useTransition } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  MediaLibraryModal,
  type MediaLibraryResult,
} from "@/app/(admin)/_components/MediaLibrary";
import { createAdditionalSpotMap } from "@/app/_lib/apps/spot-booking/wizard-actions";

// ── Types ───────────────────────────────────────────────────────

type CategoryOption = {
  id: string;
  title: string;
  accommodationCount: number;
};

type Props = {
  categories: CategoryOption[];
  onClose: () => void;
  onCreated: () => void;
};

// ── Component ───────────────────────────────────────────────────

export function CreateMapModal({ categories, onClose, onCreated }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePublicId, setImagePublicId] = useState("");
  const [addonPriceSek, setAddonPriceSek] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    selectedCategoryId && imageUrl && addonPriceSek && !isPending;

  function handleSubmit() {
    const priceNumber = parseFloat(addonPriceSek);
    if (isNaN(priceNumber) || priceNumber <= 0) {
      setError("Ange ett giltigt pris");
      return;
    }

    const addonPrice = Math.round(priceNumber * 100);

    startTransition(async () => {
      const result = await createAdditionalSpotMap({
        accommodationCategoryId: selectedCategoryId,
        imageUrl,
        imagePublicId,
        addonPrice,
        currency,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onCreated();
    });
  }

  return (
    <>
      <div className="sml__modal-overlay" onClick={onClose} />
      <div className="sml__modal">
        <div className="sml__modal-header">
          <h2 className="sml__modal-title">Skapa ny karta</h2>
          <button className="sml__modal-close" onClick={onClose}>
            <EditorIcon name="close" size={20} />
          </button>
        </div>

        <div className="sml__modal-body">
          {error && (
            <div className="sml__modal-error">
              <EditorIcon name="error" size={16} />
              {error}
            </div>
          )}

          {/* Category picker */}
          <label className="admin-label--sm">Boendetyp</label>
          <div className="sml__category-list">
            {categories.map((c) => (
              <button
                key={c.id}
                className={`sml__category-item${selectedCategoryId === c.id ? " sml__category-item--selected" : ""}`}
                onClick={() => {
                  setSelectedCategoryId(c.id);
                  setError(null);
                }}
              >
                <span
                  className={`sml__category-radio${selectedCategoryId === c.id ? " sml__category-radio--on" : ""}`}
                />
                <span className="sml__category-name">{c.title}</span>
                <span className="sml__category-count">
                  {c.accommodationCount} boenden
                </span>
              </button>
            ))}
          </div>

          {/* Image upload */}
          <label className="admin-label--sm">Kartbild</label>
          {imageUrl ? (
            <div className="sml__preview">
              <img src={imageUrl} alt="Kartforhandsvisning" />
              <button
                className="sml__preview-remove"
                onClick={() => {
                  setImageUrl("");
                  setImagePublicId("");
                }}
                title="Ta bort bild"
              >
                <EditorIcon name="close" size={14} />
              </button>
            </div>
          ) : (
            <button
              className="sml__upload-area"
              onClick={() => setMediaOpen(true)}
            >
              <EditorIcon name="cloud_upload" size={28} />
              <span>Valj bild</span>
            </button>
          )}

          {/* Price */}
          <label className="admin-label--sm">Tilllaggsavgift</label>
          <div className="sml__price-row">
            <input
              type="number"
              className="admin-input--sm sml__price-input"
              placeholder="50"
              value={addonPriceSek}
              onChange={(e) => {
                setAddonPriceSek(e.target.value);
                setError(null);
              }}
              min={1}
              step={1}
            />
            <select
              className="admin-input--sm sml__currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="SEK">SEK</option>
              <option value="EUR">EUR</option>
              <option value="NOK">NOK</option>
              <option value="DKK">DKK</option>
            </select>
          </div>
        </div>

        <div className="sml__modal-footer">
          <button className="admin-btn" onClick={onClose}>
            Avbryt
          </button>
          <button
            className="admin-btn admin-btn--accent"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isPending ? "Skapar..." : "Skapa karta"}
          </button>
        </div>
      </div>

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
    </>
  );
}
