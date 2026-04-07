"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  MediaLibraryModal,
  type MediaLibraryResult,
} from "@/app/(admin)/_components/MediaLibrary";
import { createAdditionalSpotMap } from "@/app/_lib/apps/spot-booking/wizard-actions";

// ── Types ───────────────────────────────────────────────────────

type AccommodationOption = {
  id: string;
  name: string;
  categoryTitle: string;
};

type Props = {
  accommodations: AccommodationOption[];
  onClose: () => void;
  onCreated: () => void;
};

// ── Component ───────────────────────────────────────────────────

export function CreateMapModal({ accommodations, onClose, onCreated }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageUrl, setImageUrl] = useState("");
  const [imagePublicId, setImagePublicId] = useState("");
  const [addonPriceSek, setAddonPriceSek] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupTop, setPopupTop] = useState(0);

  const canSubmit =
    selectedIds.size > 0 && imageUrl && addonPriceSek && !isPending;

  function toggleAccommodation(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  }

  // Picker close on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
        setPickerSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPickerOpen(false); setPickerSearch(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [pickerOpen]);

  const openPicker = () => {
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
    setPickerOpen(true);
    setPickerSearch("");
  };

  const pickerQuery = pickerSearch.trim().toLowerCase();
  const pickerFiltered = pickerQuery
    ? accommodations.filter((a) => a.name.toLowerCase().includes(pickerQuery))
    : accommodations;

  function handleSubmit() {
    const priceNumber = parseFloat(addonPriceSek);
    if (isNaN(priceNumber) || priceNumber <= 0) {
      setError("Ange ett giltigt pris");
      return;
    }

    const addonPrice = Math.round(priceNumber * 100);

    startTransition(async () => {
      const result = await createAdditionalSpotMap({
        accommodationIds: Array.from(selectedIds),
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

  const displayName = selectedIds.size === 0
    ? "Välj boenden..."
    : (() => {
        const first = accommodations.find((a) => selectedIds.has(a.id));
        const extra = selectedIds.size > 1 ? ` + ${selectedIds.size - 1}` : "";
        return `${first?.name ?? ""}${extra}`;
      })();

  const pickerPopup = pickerOpen && typeof document !== "undefined" && createPortal(
    <div className="sp-resource-popup" ref={popupRef} style={{ top: popupTop }}>
      <div className="pk-popup__search">
        <svg className="pk-popup__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input
          type="text"
          className="pk-popup__search-input"
          placeholder="Sök boende..."
          value={pickerSearch}
          onChange={(e) => setPickerSearch(e.target.value)}
          autoComplete="off"
        />
        {pickerSearch && (
          <button type="button" className="pk-popup__search-clear" onClick={() => setPickerSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="sp-resource-popup__list">
        {pickerFiltered.length === 0 ? (
          <div className="sp-resource-popup__empty">Inga resultat</div>
        ) : (
          pickerFiltered.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`sp-resource-popup__item${selectedIds.has(a.id) ? " sp-resource-popup__item--active" : ""}`}
              onClick={() => toggleAccommodation(a.id)}
            >
              <div className="sp-resource-popup__item-img sp-resource-popup__item-img--empty">
                <EditorIcon name="hotel" size={12} />
              </div>
              <span className="sp-resource-popup__item-title">{a.name}</span>
              {selectedIds.has(a.id) && (
                <EditorIcon name="check" size={16} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );

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

          {/* Accommodation picker */}
          <label className="admin-label--sm">Boenden</label>
          <div className="sp-resource-picker">
            <button
              ref={triggerRef}
              type="button"
              className="sp-resource-picker__trigger"
              onClick={() => pickerOpen ? setPickerOpen(false) : openPicker()}
            >
              <div className="sp-resource-picker__thumb sp-resource-popup__item-img--empty">
                <EditorIcon name="hotel" size={14} />
              </div>
              <span className="sp-resource-picker__trigger-text">
                <span className="sp-resource-picker__value">{displayName}</span>
              </span>
              <EditorIcon name="unfold_more" size={16} className="sp-resource-picker__icon" />
            </button>
            {pickerPopup}
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
