"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { groupFacilitiesByCategory, FACILITY_MAP, FACILITY_CATEGORY_LABELS } from "@/app/_lib/accommodations/facility-map";
import type { FacilityCategory } from "@/app/_lib/accommodations/facility-map";
import {
  archiveAccommodation,
  deleteAccommodation,
  updateAccommodation,
} from "../actions";
import { listAccommodationCategories } from "@/app/(admin)/accommodation-categories/actions";
import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";
import type { AccommodationStatus, FacilityType, BedType } from "@prisma/client";
import { SearchListingEditor } from "@/app/(admin)/_components/SearchListingEditor";
import type { SeoPreviewResult } from "@/app/_lib/seo/preview";
import { stripHtml } from "@/app/_lib/seo/text";
import "../../products/_components/product-form.css";
import "../accommodations.css";

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
  seo,
  initialPreview,
}: {
  accommodation: ResolvedAccommodation;
  tenantId: string;
  /**
   * Current per-entity SEO overrides (parsed at the page boundary
   * via `safeParseSeoMetadata`). `resolveAccommodation()` doesn't
   * propagate the raw `seo` JSONB, so the parent page passes it
   * separately.
   */
  seo: { title: string; description: string };
  /**
   * SSR-prepared preview snapshot for the first render. When
   * `previewSeoForEntity` fails during page load the parent passes
   * undefined and `SearchListingEditor` falls back to its own
   * loading shell until the first debounced client refresh settles.
   */
  initialPreview?: SeoPreviewResult;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Header "Fler åtgärder" dropdown — mirrors ProductForm's actionsRef
  // pattern (same outside-click behaviour, same `.pf-actions-dropdown`
  // CSS classes from product-form.css).
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // ── Editable fields ──
  const [nameInput, setNameInput] = useState(accommodation.displayName ?? "");
  const [descInput, setDescInput] = useState(accommodation.displayDescription ?? "");
  const [status, setStatus] = useState<AccommodationStatus>(accommodation.status as AccommodationStatus);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [externalCode, setExternalCode] = useState(accommodation.externalCode ?? "");

  // ── SEO overrides (title + description in Batch 2; OG image +
  // noindex land in later batches). Submitted inside the save
  // payload — the server action shallow-merges with stored seo so
  // future fields carry through unchanged. `handleSeoChange` lives
  // further down, once `markDirty` is declared.
  const [seoState, setSeoState] = useState<{ title: string; description: string }>({
    title: seo.title,
    description: seo.description,
  });

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handle = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [statusOpen]);

  // Close header "Fler åtgärder" dropdown on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handle = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [actionsOpen]);

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

  // ── Highlights ──
  type HighlightItem = { _id: string; icon: string; text: string; description: string };
  const [highlights, setHighlights] = useState<HighlightItem[]>(
    () => (accommodation.highlights ?? []).map((h) => ({ _id: makeMediaId(), icon: h.icon, text: h.text, description: h.description ?? "" })),
  );
  const [highlightDragId, setHighlightDragId] = useState<string | null>(null);
  const highlightSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const addHighlight = useCallback(() => {
    setHighlights((prev) => [...prev, { _id: makeMediaId(), icon: "", text: "", description: "" }]);
    markDirty();
  }, []);

  const updateHighlight = useCallback((id: string, field: "icon" | "text" | "description", value: string) => {
    setHighlights((prev) => prev.map((h) => h._id === id ? { ...h, [field]: value } : h));
    markDirty();
  }, []);

  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h._id !== id));
    markDirty();
  }, []);

  const handleHighlightDragEnd = useCallback((e: DragEndEvent) => {
    setHighlightDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setHighlights((prev) => {
      const oldIdx = prev.findIndex((h) => h._id === active.id);
      const newIdx = prev.findIndex((h) => h._id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    markDirty();
  }, []);

  // ── Capacity ──
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [bedDropdownOpen, setBedDropdownOpen] = useState(false);
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

  // ── Categories (same pattern as ProductForm collections) ──
  type CategoryItem = { id: string; title: string };
  const [allCategories, setAllCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(accommodation.categoryIds),
  );
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoriesSearch, setCategoriesSearch] = useState("");
  const categoriesRef = useRef<HTMLDivElement>(null);

  // Load categories on mount
  useEffect(() => {
    listAccommodationCategories().then((cats) => {
      setAllCategories(cats.map((c) => ({ id: c.id, title: c.title })));
    });
  }, []);

  // Close categories dropdown on outside click
  useEffect(() => {
    if (!categoriesOpen) return;
    const handle = (e: MouseEvent) => {
      if (categoriesRef.current && !categoriesRef.current.contains(e.target as Node)) setCategoriesOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [categoriesOpen]);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    markDirty();
  }, []);

  const removeCategory = useCallback((id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    markDirty();
  }, []);

  // ── Tags ──
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const addTag = useCallback((raw: string) => {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    setTags((prev) => prev.includes(name) ? prev : [...prev, name]);
    setTagInput("");
    markDirty();
  }, []);

  const removeTag = useCallback((name: string) => {
    setTags((prev) => prev.filter((t) => t !== name));
    markDirty();
  }, []);

  // ── Bed configs ──
  const [bedConfigs, setBedConfigs] = useState(
    accommodation.bedConfigs.map((b) => ({ bedType: b.bedType as BedType, quantity: b.quantity })),
  );

  const markDirty = useCallback(() => setDirty(true), []);

  const handleSeoChange = useCallback(
    (next: { title: string; description: string }) => {
      setSeoState(next);
      markDirty();
    },
    [markDirty],
  );

  // Memoize the HTML-stripped accommodation description — piped into
  // SearchListingEditor's `value.description` fallback so merchants
  // see the resolver's description source mirrored live in the
  // preview without re-stripping on every keystroke.
  const strippedAccommodationDescription = useMemo(
    () => stripHtml(descInput),
    [descInput],
  );

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
        highlights: highlights.filter((h) => h.icon.trim() || h.text.trim()).map((h, i) => ({ icon: h.icon.trim(), text: h.text.trim(), description: h.description.trim(), sortOrder: i })),
        bedConfigs: bedConfigs.filter((b) => b.quantity > 0),
        facilities: Array.from(selectedFacilities).map((ft) => ({
          facilityType: ft,
          source: "MANUAL" as const,
          overrideHidden: false,
        })),
        categoryIds: Array.from(selectedCategoryIds),
        maxGuests: capMaxGuests,
        minGuests: capMinGuests,
        extraBeds: capExtraBeds,
        roomSizeSqm: capRoomSize || null,
        bedrooms: capBedrooms || null,
        bathrooms: capBathrooms || null,
        seo: {
          title: seoState.title,
          description: seoState.description,
        },
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
  }, [nameInput, descInput, status, externalCode, media, highlights, bedConfigs, selectedFacilities, selectedCategoryIds, capMaxGuests, capMinGuests, capExtraBeds, capRoomSize, capBedrooms, capBathrooms, seoState, accommodation.id, router]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setNameInput(accommodation.displayName ?? "");
    setDescInput(accommodation.displayDescription ?? "");
    setStatus(accommodation.status as AccommodationStatus);
    setExternalCode(accommodation.externalCode ?? "");
    setMedia(accommodation.media.map((m) => ({ _id: makeMediaId(), url: m.url, alt: m.altText ?? "" })));
    setHighlights((accommodation.highlights ?? []).map((h) => ({ _id: makeMediaId(), icon: h.icon, text: h.text, description: h.description ?? "" })));
    setBedConfigs(accommodation.bedConfigs.map((b) => ({ bedType: b.bedType as BedType, quantity: b.quantity })));
    setSelectedFacilities(new Set(accommodation.facilities.filter((f) => f.isVisible).map((f) => f.facilityType as FacilityType)));
    setCapMaxGuests(accommodation.maxGuests);
    setCapMinGuests(accommodation.minGuests);
    setCapExtraBeds(accommodation.extraBeds);
    setCapRoomSize(accommodation.roomSizeSqm ?? 0);
    setCapBedrooms(accommodation.bedrooms ?? 0);
    setCapBathrooms(accommodation.bathrooms ?? 0);
    setSelectedCategoryIds(new Set(accommodation.categoryIds));
    setSeoState({ title: seo.title, description: seo.description });
    setTags([]);
    setTagInput("");
    setTimeout(() => {
      setDirty(false);
      setIsDiscarding(false);
    }, 100);
  }, [accommodation, seo]);

  return (
    <div className="admin-page admin-page--no-preview accommodations-page">
      <div className="admin-editor">
        {/* ── Header (breadcrumb + actions — mirrors ProductForm) ── */}
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
          <div className="pf-header__actions">
            <button className="settings-btn--muted" disabled>Duplicera</button>
            <button className="settings-btn--muted" disabled>Förhandsgranska</button>
            <div style={{ position: "relative" }} ref={actionsRef}>
              <button className="settings-btn--muted" onClick={() => setActionsOpen(!actionsOpen)}>
                Fler åtgärder
                <EditorIcon name="expand_more" size={16} />
              </button>
              {actionsOpen && (
                <div className="pf-actions-dropdown">
                  <button
                    className="pf-actions-dropdown__item"
                    onClick={async () => {
                      setActionsOpen(false);
                      if (!confirm("Vill du arkivera detta boende? Det kan återställas senare.")) return;
                      const result = await archiveAccommodation(accommodation.id);
                      if (result.ok) {
                        router.push("/accommodations");
                      } else {
                        alert(result.error);
                      }
                    }}
                  >
                    <EditorIcon name="archive" size={18} />
                    Arkivera boende
                  </button>
                  <button
                    className="pf-actions-dropdown__item pf-actions-dropdown__item--danger"
                    onClick={async () => {
                      setActionsOpen(false);
                      if (!confirm("Vill du permanent radera detta boende? Detta kan inte ångras.")) return;
                      const result = await deleteAccommodation(accommodation.id);
                      if (result.ok) {
                        router.push("/accommodations");
                      } else {
                        alert(result.error);
                      }
                    }}
                  >
                    <EditorIcon name="delete" size={18} />
                    Radera boende
                  </button>
                </div>
              )}
            </div>
          </div>
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

            {/* ── Höjdpunkter (egen container) ── */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Höjdpunkter</span>
              </div>
              {highlights.length > 0 && (
                <DndContext
                  sensors={highlightSensors}
                  onDragStart={(e) => setHighlightDragId(String(e.active.id))}
                  onDragEnd={handleHighlightDragEnd}
                >
                  <SortableContext items={highlights.map((h) => h._id)} strategy={verticalListSortingStrategy}>
                    <div className="ah-list">
                      {highlights.map((h) => (
                        <SortableHighlightRow
                          key={h._id}
                          id={h._id}
                          icon={h.icon}
                          text={h.text}
                          description={h.description}
                          onIconChange={(v) => updateHighlight(h._id, "icon", v)}
                          onTextChange={(v) => updateHighlight(h._id, "text", v)}
                          onDescriptionChange={(v) => updateHighlight(h._id, "description", v)}
                          onRemove={() => removeHighlight(h._id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {highlightDragId ? (() => {
                      const h = highlights.find((x) => x._id === highlightDragId);
                      if (!h) return null;
                      return (
                        <div className="ah-row ah-row--dragging">
                          <span className="ah-row__drag"><EditorIcon name="drag_indicator" size={16} /></span>
                          <span className="material-symbols-rounded ah-row__icon-preview" style={{ fontSize: 20 }}>{h.icon || "add"}</span>
                          <span className="ah-row__text-preview">{h.text || "Höjdpunkt"}</span>
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>
              )}
              <button type="button" className="ah-add" onClick={addHighlight}>
                <EditorIcon name="add_circle" size={16} />
                <span>Lägg till höjdpunkt</span>
              </button>
            </div>

            {/* ── Sökmotorlistning ──
                Compose-at-parent: `value.*` reflects the live
                resolver view (override wins; falls back to the
                accommodation's editable name/description). The
                raw `override.*` drives input binding + save
                payload. */}
            <SearchListingEditor
              resourceType="accommodation"
              entityId={accommodation.id}
              value={{
                title: seoState.title || nameInput,
                description:
                  seoState.description ||
                  strippedAccommodationDescription,
                slug: accommodation.slug,
              }}
              override={{
                title: seoState.title,
                description: seoState.description,
              }}
              parentTitle={nameInput}
              parentDescription={strippedAccommodationDescription}
              onChange={handleSeoChange}
              initialPreview={initialPreview}
            />

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
                <div className="pf-collection-pills">
                  {Array.from(selectedFacilities).map((ft) => {
                    const meta = FACILITY_MAP[ft];
                    if (!meta) return null;
                    return (
                      <span key={ft} className="pf-collection-pill">
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Boendeorganisering */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Boendeorganisering</span>
              </div>

              <label className="mi-card__field-label" style={{ marginBottom: 6, display: "block", fontWeight: 400 }}>Boendetyper</label>
              <div className="admin-dropdown" ref={categoriesRef}>
                <div className="pf-collection-trigger" onClick={() => setCategoriesOpen(true)}>
                  <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                  <input
                    type="text"
                    className="pf-collection-trigger__input"
                    value={categoriesSearch}
                    onChange={(e) => { setCategoriesSearch(e.target.value); setCategoriesOpen(true); }}
                    onFocus={() => setCategoriesOpen(true)}
                    placeholder=""
                  />
                </div>
                {categoriesOpen && (
                  <div className="admin-dropdown__list" style={{ padding: 0 }}>
                    <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px" }}>
                      {allCategories
                        .filter((c) => !categoriesSearch || c.title.toLowerCase().includes(categoriesSearch.toLowerCase()))
                        .map((cat) => {
                          const checked = selectedCategoryIds.has(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              className="admin-dropdown__item"
                              onClick={() => toggleCategory(cat.id)}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span className={`fac-check${checked ? " fac-check--on" : ""}`}>
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </span>
                                <span style={{ fontSize: 13 }}>{cat.title}</span>
                              </div>
                            </button>
                          );
                        })}
                      {allCategories.filter((c) => !categoriesSearch || c.title.toLowerCase().includes(categoriesSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--admin-text-tertiary)" }}>
                          Inga boendetyper hittades
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedCategoryIds.size > 0 && (
                <div className="pf-collection-pills">
                  {Array.from(selectedCategoryIds).map((id) => {
                    const cat = allCategories.find((c) => c.id === id);
                    if (!cat) return null;
                    return (
                      <span key={id} className="pf-collection-pill">
                        {cat.title}
                        <button
                          type="button"
                          className="pf-collection-pill__remove"
                          onClick={() => removeCategory(id)}
                          aria-label={`Ta bort ${cat.title}`}
                        >
                          <EditorIcon name="close" size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Taggar */}
              <label className="mi-card__field-label" style={{ marginBottom: 6, marginTop: 16, display: "block", fontWeight: 400 }}>Taggar</label>
              <div className="pf-collection-trigger">
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                  }}
                  placeholder=""
                />
              </div>
              {tags.length > 0 && (
                <div className="pf-collection-pills">
                  {tags.map((tag) => (
                    <span key={tag} className="pf-collection-pill">
                      {tag}
                      <button
                        type="button"
                        className="pf-collection-pill__remove"
                        onClick={() => removeTag(tag)}
                        aria-label={`Ta bort ${tag}`}
                      >
                        <EditorIcon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                className="admin-btn"
                style={{ padding: "6px 12px", borderRadius: 8, background: "var(--dark-primary)", color: "var(--dark-primary-text)", transition: "background 0.15s" }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--dark-primary-hover)"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "var(--dark-primary)"; }}
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

              {/* Bäddkonfiguration */}
              <div style={{ borderTop: "1px solid var(--admin-border)", paddingTop: 16, marginTop: 4 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--admin-text)", marginBottom: 8 }}>Bäddkonfiguration</label>
                {bedConfigs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {bedConfigs.map((b, i) => (
                      <div key={b.bedType} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}
                          onClick={() => setBedConfigs(bedConfigs.filter((_, idx) => idx !== i))}
                        >
                          <EditorIcon name="close" size={14} />
                        </button>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--admin-text)" }}>{BED_TYPE_LABELS[b.bedType] ?? b.bedType}</span>
                        <button
                          type="button"
                          style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--admin-border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text)" }}
                          onClick={() => {
                            const next = [...bedConfigs];
                            if (next[i].quantity <= 1) {
                              setBedConfigs(next.filter((_, idx) => idx !== i));
                            } else {
                              next[i] = { ...next[i], quantity: next[i].quantity - 1 };
                              setBedConfigs(next);
                            }
                          }}
                        >
                          <EditorIcon name="remove" size={14} />
                        </button>
                        <span style={{ width: 22, textAlign: "center", fontSize: 13, fontWeight: 500 }}>{b.quantity}</span>
                        <button
                          type="button"
                          style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--admin-border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text)" }}
                          onClick={() => {
                            const next = [...bedConfigs];
                            next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                            setBedConfigs(next);
                          }}
                        >
                          <EditorIcon name="add" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#616161", cursor: "pointer", pointerEvents: "none" }}>
                    <EditorIcon name="add_circle" size={16} />
                    Lägg till sängtyp
                  </div>
                  <select
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                    value=""
                    onChange={(e) => {
                      const bt = e.target.value as BedType;
                      if (!bt) return;
                      if (bedConfigs.some((b) => b.bedType === bt)) return;
                      setBedConfigs([...bedConfigs, { bedType: bt, quantity: 1 }]);
                    }}
                  >
                    <option value="">Lägg till sängtyp...</option>
                    {(Object.entries(BED_TYPE_LABELS) as [string, string][])
                      .filter(([key]) => !bedConfigs.some((b) => b.bedType === key))
                      .map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                  </select>
                </div>
              </div>
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

function SortableHighlightRow({ id, icon, text, description, onIconChange, onTextChange, onDescriptionChange, onRemove }: {
  id: string;
  icon: string;
  text: string;
  description: string;
  onIconChange: (v: string) => void;
  onTextChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [iconFocused, setIconFocused] = useState(false);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="ah-row">
      <span className="ah-row__drag" {...attributes} {...listeners}>
        <EditorIcon name="drag_indicator" size={16} />
      </span>
      {icon && !iconFocused && (
        <span className="material-symbols-rounded ah-row__icon-preview" style={{ fontSize: 20 }}>
          {icon}
        </span>
      )}
      <div className="ah-row__fields">
        <div className="ah-row__top">
          <input
            type="text"
            className="ah-row__input ah-row__input--icon"
            value={icon}
            onChange={(e) => onIconChange(e.target.value)}
            onFocus={() => setIconFocused(true)}
            onBlur={() => setIconFocused(false)}
            placeholder="Ikon"
          />
          <input
            type="text"
            className="ah-row__input ah-row__input--text"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Rubrik"
          />
        </div>
        <input
          type="text"
          className="ah-row__input ah-row__input--desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Beskrivning"
        />
      </div>
      <button type="button" className="ah-row__remove" onClick={onRemove} aria-label="Ta bort">
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
