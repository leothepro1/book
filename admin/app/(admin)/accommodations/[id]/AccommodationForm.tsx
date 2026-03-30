"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { groupFacilitiesByCategory, FACILITY_MAP, FACILITY_CATEGORY_LABELS } from "@/app/_lib/accommodations/facility-map";
import type { FacilityCategory } from "@/app/_lib/accommodations/facility-map";
import { updateAccommodation } from "../actions";
import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";
import type { AccommodationStatus, FacilityType, BedType } from "@prisma/client";
import "../../products/_components/product-form.css";

// ── Constants ────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const TYPE_LABELS: Record<string, string> = {
  HOTEL: "Hotell", CABIN: "Stuga", CAMPING: "Camping",
  APARTMENT: "Lägenhet", PITCH: "Plats",
};

const BED_TYPE_LABELS: Record<string, string> = {
  SINGLE: "Enkelsäng", DOUBLE: "Dubbelsäng", QUEEN: "Queen size",
  KING: "King size", SOFA_BED: "Bäddsoffa", BUNK_BED: "Våningssäng",
  FRENCH: "Fransk säng", FUTON: "Futon", TATAMI: "Tatami",
  FOLDABLE: "Nedfällbar säng", EXTRA_BED: "Extrasäng",
};

const CANCELLATION_LABELS: Record<string, string> = {
  FLEXIBLE: "Flexibel", MODERATE: "Måttlig", NON_REFUNDABLE: "Ej återbetalningsbar",
};

// ── Media with ID (for DnD) — same pattern as ProductForm ──
type MediaItem = { _id: string; url: string; alt: string };
let mediaSeq = 0;
function makeMediaId(): string { return `amed_${Date.now()}_${++mediaSeq}`; }

function formatDate(d: string | Date | null): string {
  if (!d) return "Aldrig";
  return new Date(d).toLocaleString("sv-SE");
}

// ── Component ────────────────────────────────────────────────

export default function AccommodationForm({
  accommodation,
  tenantId,
}: {
  accommodation: ResolvedAccommodation;
  tenantId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Editable fields ──
  const [nameOverride, setNameOverride] = useState(accommodation.displayName !== accommodation.displayName ? "" : "");
  const [nameInput, setNameInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [status, setStatus] = useState<AccommodationStatus>(accommodation.status as AccommodationStatus);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [externalCode, setExternalCode] = useState("");

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handle = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [statusOpen]);

  // ── Media (same pattern as ProductForm) ──
  const [media, setMedia] = useState<MediaItem[]>(
    () => accommodation.media.map((m) => ({ _id: makeMediaId(), url: m.url, alt: m.altText ?? "" })),
  );
  const [mediaLibOpen, setMediaLibOpen] = useState(false);
  const [mediaDragId, setMediaDragId] = useState<string | null>(null);
  const mediaSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleMediaSelectMulti = useCallback((assets: MediaLibraryResult[]) => {
    setMedia((prev) => {
      const existingUrls = new Set(prev.map((m) => m.url));
      const newItems = assets
        .filter((a) => !existingUrls.has(a.url))
        .map((a) => ({ _id: makeMediaId(), url: a.url, alt: "" }));
      return [...prev, ...newItems];
    });
    setMediaLibOpen(false);
    markDirty();
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((m) => m._id !== id));
    markDirty();
  }, []);

  const handleMediaDragEnd = useCallback((e: DragEndEvent) => {
    setMediaDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setMedia((prev) => {
      const oldIdx = prev.findIndex((m) => m._id === active.id);
      const newIdx = prev.findIndex((m) => m._id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    markDirty();
  }, []);

  // ── Capacity ──
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [capMaxGuests, setCapMaxGuests] = useState(accommodation.maxGuests);
  const [capMinGuests, setCapMinGuests] = useState(accommodation.minGuests);
  const [capExtraBeds, setCapExtraBeds] = useState(accommodation.extraBeds);
  const [capRoomSize, setCapRoomSize] = useState(accommodation.roomSizeSqm ?? 0);
  const [capBedrooms, setCapBedrooms] = useState(accommodation.bedrooms ?? 0);
  const [capBathrooms, setCapBathrooms] = useState(accommodation.bathrooms ?? 0);

  // ── Facilities ──
  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [selectedFacilities, setSelectedFacilities] = useState<Set<FacilityType>>(
    () => new Set(accommodation.facilities.filter((f) => f.isVisible).map((f) => f.facilityType as FacilityType)),
  );

  // ── Bed configs ──
  const [bedConfigs, setBedConfigs] = useState(
    accommodation.bedConfigs.map((b) => ({ bedType: b.bedType as BedType, quantity: b.quantity })),
  );

  const markDirty = useCallback(() => setDirty(true), []);

  // ── Facilities (read-only display for V1) ──
  const facilityGroups = groupFacilitiesByCategory(accommodation.facilities);

  // ── Save ──
  const handleSave = useCallback(() => {
    setIsSaving(true);
    setSaveError(null);
    startTransition(async () => {
      const result = await updateAccommodation(accommodation.id, {
        nameOverride: nameInput || null,
        descriptionOverride: descInput || null,
        status,
        externalCode: externalCode || null,
        media: media.map((m, i) => ({ url: m.url, altText: m.alt, sortOrder: i })),
        bedConfigs: bedConfigs.filter((b) => b.quantity > 0),
        facilities: Array.from(selectedFacilities).map((ft) => ({
          facilityType: ft,
          source: "MANUAL" as const,
          overrideHidden: false,
        })),
        maxGuests: capMaxGuests,
        minGuests: capMinGuests,
        extraBeds: capExtraBeds,
        roomSizeSqm: capRoomSize || null,
        bedrooms: capBedrooms || null,
        bathrooms: capBathrooms || null,
      });

      setIsSaving(false);
      if (result.ok) {
        setDirty(false);
        setSavedAt(true);
        setTimeout(() => setSavedAt(false), 1500);
        router.refresh();
      } else {
        setSaveError(result.error);
        setTimeout(() => setSaveError(null), 5000);
      }
    });
  }, [nameInput, descInput, status, externalCode, bedConfigs, selectedFacilities, capMaxGuests, capMinGuests, capExtraBeds, capRoomSize, capBedrooms, capBathrooms, accommodation.id, router]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setNameInput("");
    setDescInput("");
    setStatus(accommodation.status as AccommodationStatus);
    setExternalCode("");
    setMedia(accommodation.media.map((m) => ({ _id: makeMediaId(), url: m.url, alt: m.altText ?? "" })));
    setBedConfigs(accommodation.bedConfigs.map((b) => ({ bedType: b.bedType as BedType, quantity: b.quantity })));
    setSelectedFacilities(new Set(accommodation.facilities.filter((f) => f.isVisible).map((f) => f.facilityType as FacilityType)));
    setCapMaxGuests(accommodation.maxGuests);
    setCapMinGuests(accommodation.minGuests);
    setCapExtraBeds(accommodation.extraBeds);
    setCapRoomSize(accommodation.roomSizeSqm ?? 0);
    setCapBedrooms(accommodation.bedrooms ?? 0);
    setCapBathrooms(accommodation.bathrooms ?? 0);
    setTimeout(() => {
      setDirty(false);
      setIsDiscarding(false);
    }, 100);
  }, [accommodation]);

  return (
    <div className="admin-page admin-page--no-preview accommodations-page">
      <div className="admin-editor">
        {/* ── Header (breadcrumb) ── */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/accommodations")}
              aria-label="Tillbaka till boenden"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>villa</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>{accommodation.displayName}</span>
          </h1>
        </div>

        {/* ── Body: two-column ── */}
        <div className="pf-body">
          {/* Left column (70%) */}
          <div className="pf-main">
            {/* Card 1 — Grundinformation */}
            <div style={CARD}>
              <div className="pf-field">
                <label className="admin-label">Namn</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); markDirty(); }}
                  placeholder={accommodation.displayName}
                />
              </div>
              <div className="pf-field">
                <label className="admin-label">Beskrivning</label>
                <RichTextEditor
                  value={descInput}
                  onChange={(v) => { setDescInput(v); markDirty(); }}
                  placeholder="Beskriv boendet..."
                  minHeight={120}
                  maxHeight={300}
                />
              </div>
              <div className="pf-field">
                <label className="admin-label">Media</label>
                {media.length > 0 ? (
                  <DndContext
                    sensors={mediaSensors}
                    onDragStart={(e) => setMediaDragId(String(e.active.id))}
                    onDragEnd={handleMediaDragEnd}
                  >
                    <SortableContext items={media.map((m) => m._id)} strategy={rectSortingStrategy}>
                      <div className="pf-media-grid-flat">
                        {media.map((m, idx) => (
                          <SortableMediaCell
                            key={m._id}
                            id={m._id}
                            url={m.url}
                            alt={m.alt}
                            size={idx === 0 ? "featured" : "small"}
                            onRemove={removeMedia}
                          />
                        ))}
                        {media.length < 9 && (
                          <div className="pf-media-cell pf-media-cell--small pf-media-cell--add" onClick={() => setMediaLibOpen(true)}>
                            <EditorIcon name="add" size={16} />
                          </div>
                        )}
                      </div>
                    </SortableContext>
                    {typeof document !== "undefined" && createPortal(
                      <DragOverlay dropAnimation={null}>
                        {mediaDragId && (() => {
                          const m = media.find((x) => x._id === mediaDragId);
                          const idx = media.findIndex((x) => x._id === mediaDragId);
                          const isFeatured = idx === 0;
                          return m ? (
                            <div className={`pf-media-cell ${isFeatured ? "pf-media-cell--featured" : "pf-media-cell--small"}`} style={{ opacity: 0.9, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
                              <img src={m.url} alt={m.alt} className="pf-media-cell__img" />
                            </div>
                          ) : null;
                        })()}
                      </DragOverlay>,
                      document.body,
                    )}
                  </DndContext>
                ) : (
                  <div className="pf-media-empty">
                    <button type="button" className="pf-media-empty__btn" onClick={() => setMediaLibOpen(true)}>
                      Lägg till media
                    </button>
                  </div>
                )}
              </div>
              <div className="pf-field">
                <label className="admin-label">Internt rumsnummer / kod</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={externalCode}
                  onChange={(e) => { setExternalCode(e.target.value); markDirty(); }}
                  placeholder="T.ex. 101, A12"
                />
              </div>
            </div>

            {/* Card 2 — Bäddkonfiguration */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Bäddkonfiguration</span>
              </div>
              {bedConfigs.length === 0 ? (
                <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", margin: 0 }}>
                  Ingen bäddkonfiguration angiven.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bedConfigs.map((b, i) => (
                    <div key={b.bedType} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{BED_TYPE_LABELS[b.bedType] ?? b.bedType}</span>
                      <button
                        type="button"
                        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => {
                          const next = [...bedConfigs];
                          next[i] = { ...next[i], quantity: Math.max(0, next[i].quantity - 1) };
                          setBedConfigs(next.filter((c) => c.quantity > 0));
                          markDirty();
                        }}
                      >
                        <EditorIcon name="remove" size={16} />
                      </button>
                      <span style={{ width: 24, textAlign: "center", fontSize: 14, fontWeight: 500 }}>{b.quantity}</span>
                      <button
                        type="button"
                        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => {
                          const next = [...bedConfigs];
                          next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                          setBedConfigs(next);
                          markDirty();
                        }}
                      >
                        <EditorIcon name="add" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column (30%) */}
          <div className="pf-sidebar">
            {/* Status */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Status</span>
              </div>
              <div className="admin-dropdown" ref={statusRef}>
                <button
                  type="button"
                  className="admin-dropdown__trigger"
                  onClick={() => setStatusOpen(!statusOpen)}
                >
                  <span className="admin-dropdown__text" style={{ textAlign: "left" }}>{status === "ACTIVE" ? "Aktiv" : "Utkast"}</span>
                  <EditorIcon name="expand_more" size={18} className="admin-dropdown__chevron" />
                </button>
                {statusOpen && (
                  <div className="admin-dropdown__list">
                    <button
                      type="button"
                      className={`admin-dropdown__item${status === "ACTIVE" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { setStatus("ACTIVE"); setStatusOpen(false); markDirty(); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Aktiv</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Visas i bokningssökning och på hemsidan</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`admin-dropdown__item${status === "INACTIVE" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { setStatus("INACTIVE"); setStatusOpen(false); markDirty(); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Utkast</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Dolt från bokningssökning och hemsidan</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Kapacitet */}
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span className="pf-card-title">Kapacitet</span>
                <button
                  type="button"
                  style={{ display: "flex", alignItems: "center", justifyContent: "end", width: 28, height: "max-content", border: "none", borderRadius: 6, background: "none", color: "#303030", cursor: "pointer" }}
                  onClick={() => setCapacityModalOpen(true)}
                >
                  <EditorIcon name="edit" size={16} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--font-sm)" }}>
                <Row label="Max gäster" value={String(capMaxGuests)} />
                <Row label="Min gäster" value={String(capMinGuests)} />
                <Row label="Extrasängar" value={String(capExtraBeds)} />
                <Row label="Rumsstorlek" value={capRoomSize ? `${capRoomSize} m²` : "–"} />
                <Row label="Sovrum" value={capBedrooms ? String(capBedrooms) : "–"} />
                <Row label="Badrum" value={capBathrooms ? String(capBathrooms) : "–"} />
              </div>
            </div>

            {/* Faciliteter */}
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: selectedFacilities.size > 0 ? 12 : 0 }}>
                <span className="pf-card-title">Faciliteter</span>
                <button
                  type="button"
                  style={{ display: "flex", alignItems: "center", justifyContent: "end", width: 28, height: "max-content", border: "none", borderRadius: 6, background: "none", color: "#303030", cursor: "pointer" }}
                  onClick={() => setFacilityModalOpen(true)}
                >
                  <EditorIcon name="edit" size={16} />
                </button>
              </div>
              {selectedFacilities.size === 0 ? (
                <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", margin: "8px 0 0" }}>
                  Inga faciliteter valda.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Array.from(selectedFacilities).map((ft) => {
                    const meta = FACILITY_MAP[ft];
                    if (!meta) return null;
                    return (
                      <span key={ft} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 7, fontSize: 11, fontWeight: 500, background: "#f0f0f0", color: "var(--admin-text-secondary)" }}>
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PMS-information */}
            <div style={{ ...CARD, background: "var(--admin-surface)" }}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">PMS-information</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--font-sm)" }}>
                <Row label="Leverantör" value={accommodation.pmsProvider ?? "Manuell"} />
                <Row label="Externt ID" value={accommodation.externalId ?? "–"} mono />
                <Row label="Senast synkad" value={formatDate(accommodation.updatedAt)} />
                <Row label="Typ" value={TYPE_LABELS[accommodation.accommodationType] ?? accommodation.accommodationType} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Media Library */}
      <MediaLibraryModal
        open={mediaLibOpen}
        onClose={() => setMediaLibOpen(false)}
        onConfirm={() => {}}
        onConfirmMulti={handleMediaSelectMulti}
        multiSelect
        uploadFolder="accommodations"
        accept="image"
      />

      {/* Facilitetsmodal */}
      {facilityModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, animation: "cap-overlay-in 0.15s ease" }}
          onClick={() => setFacilityModalOpen(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, boxShadow: "0 24px 48px rgba(0,0,0,0.16)", width: 560, maxWidth: "90vw", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column", animation: "cap-modal-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--admin-border)", background: "#f3f3f4", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-text)" }}>Redigera faciliteter</span>
              <button
                type="button"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "none", borderRadius: 6, background: "none", color: "var(--admin-text-tertiary)", cursor: "pointer" }}
                onClick={() => setFacilityModalOpen(false)}
              >
                <EditorIcon name="close" size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {(Object.entries(FACILITY_CATEGORY_LABELS) as [FacilityCategory, string][]).map(([catKey, catLabel]) => {
                const items = (Object.entries(FACILITY_MAP) as [FacilityType, { label: string; category: FacilityCategory }][])
                  .filter(([, meta]) => meta.category === catKey)
                  .sort(([, a], [, b]) => a.label.localeCompare(b.label, "sv"));
                if (items.length === 0) return null;
                return (
                  <div key={catKey} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 550, color: "#303030", marginBottom: 8 }}>
                      {catLabel}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                      {items.map(([ft, meta]) => {
                        const checked = selectedFacilities.has(ft);
                        return (
                          <button
                            type="button"
                            key={ft}
                            className="fac-check-row"
                            onClick={() => {
                              const next = new Set(selectedFacilities);
                              if (checked) next.delete(ft); else next.add(ft);
                              setSelectedFacilities(next);
                            }}
                          >
                            <span className={`fac-check${checked ? " fac-check--on" : ""}`}>
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg">
                                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--admin-border)", flexShrink: 0 }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                style={{ padding: "5px 10px", borderRadius: 8 }}
                onClick={() => setFacilityModalOpen(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--accent"
                style={{ padding: "6px 12px", borderRadius: 8 }}
                onClick={() => {
                  setFacilityModalOpen(false);
                  markDirty();
                }}
              >
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kapacitetsmodal */}
      {capacityModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, animation: "cap-overlay-in 0.15s ease" }}
          onClick={() => setCapacityModalOpen(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, boxShadow: "0 24px 48px rgba(0,0,0,0.16)", width: 480, maxWidth: "90vw", overflow: "hidden", animation: "cap-modal-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--admin-border)", background: "#f3f3f4" }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-text)" }}>Redigera kapacitet</span>
              <button
                type="button"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "none", borderRadius: 6, background: "none", color: "var(--admin-text-tertiary)", cursor: "pointer" }}
                onClick={() => setCapacityModalOpen(false)}
              >
                <EditorIcon name="close" size={18} />
              </button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <CapField label="Max gäster" value={capMaxGuests} onChange={(v) => setCapMaxGuests(v)} min={1} />
              <CapField label="Min gäster" value={capMinGuests} onChange={(v) => setCapMinGuests(v)} min={1} />
              <CapField label="Extrasängar" value={capExtraBeds} onChange={(v) => setCapExtraBeds(v)} min={0} />
              <CapField label="Rumsstorlek (m²)" value={capRoomSize} onChange={(v) => setCapRoomSize(v)} min={0} step={0.5} />
              <CapField label="Sovrum" value={capBedrooms} onChange={(v) => setCapBedrooms(v)} min={0} />
              <CapField label="Badrum" value={capBathrooms} onChange={(v) => setCapBathrooms(v)} min={0} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--admin-border)" }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                style={{ padding: "5px 10px", borderRadius: 8 }}
                onClick={() => setCapacityModalOpen(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--accent"
                style={{ padding: "5px 10px", borderRadius: 8 }}
                onClick={() => {
                  setCapacityModalOpen(false);
                  markDirty();
                }}
              >
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save/discard bar */}
      <PublishBarUI
        hasUnsavedChanges={dirty}
        isPublishing={isSaving}
        isDiscarding={isDiscarding}
        isLingeringAfterPublish={savedAt}
        onPublish={handleSave}
        onDiscard={handleDiscard}
        error={saveError}
      />
    </div>
  );
}

// ── Shared read-only row ──

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--admin-text-secondary)" }}>{label}</span>
      <span style={mono ? { fontFamily: "var(--sf-mono, monospace)", fontSize: "var(--font-xs)" } : undefined}>{value}</span>
    </div>
  );
}

function SortableMediaCell({ id, url, alt, size, onRemove }: {
  id: string; url: string; alt: string;
  size: "featured" | "small";
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pf-media-cell ${size === "featured" ? "pf-media-cell--featured" : "pf-media-cell--small"}`}
    >
      <img src={url} alt={alt} className="pf-media-cell__img" />
      <span className="pf-media-cell__drag" {...attributes} {...listeners}>
        <EditorIcon name="drag_indicator" size={size === "featured" ? 16 : 14} />
      </span>
      <button type="button" className="pf-media-cell__remove" onClick={() => onRemove(id)} aria-label="Ta bort">
        <EditorIcon name="close" size={14} />
      </button>
    </div>
  );
}

function CapField({ label, value, onChange, min = 0, step = 1 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--admin-text)", marginBottom: 4 }}>{label}</label>
      <input
        type="number"
        style={{ width: "100%", border: "1px solid var(--admin-border)", borderRadius: 8, padding: "8px 12px", fontSize: "var(--font-sm)", fontFamily: "inherit", color: "var(--admin-text)", background: "#fff", outline: "none" }}
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        step={step}
      />
    </div>
  );
}
