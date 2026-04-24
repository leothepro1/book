"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { createAccommodationCategory, updateAccommodationCategory, updateAccommodationCategoryAddons, searchAccommodations, searchProductCollections } from "../actions";
import { SearchListingEditor } from "@/app/(admin)/_components/SearchListingEditor";
import type { SeoPreviewResult } from "@/app/_lib/seo/preview";
import { stripHtml } from "@/app/_lib/seo/text";
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "../../products/_components/product-form.css";
import "../../products/products.css";
import "../../files/files.css";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const TYPE_LABELS: Record<string, string> = {
  HOTEL: "Hotell", CABIN: "Stuga", CAMPING: "Camping",
  APARTMENT: "Lagenhet", PITCH: "Plats",
};

type AccommodationItem = {
  id: string;
  name: string;
  nameOverride: string | null;
  status: string;
  accommodationType: string;
  media: Array<{ url: string }>;
};

type ExistingCategory = {
  id: string;
  title: string;
  description: string;
  slug: string;
  imageUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  visibleInSearch?: boolean;
  version?: number;
  items: Array<{ accommodation: AccommodationItem }>;
};

function displayName(a: AccommodationItem): string {
  return a.nameOverride || a.name;
}

type AddonCollectionItem = { id: string; title: string; imageUrl?: string | null; status?: string; productCount: number };

// ── /new-flow placeholder slug ───────────────────────────────
// Mirrors NEW_ENTITY_PLACEHOLDER_SLUG.accommodation_category in the
// preview engine.
const NEW_CATEGORY_PLACEHOLDER_SLUG = "ny-boendekategori";

export default function AccommodationCategoryForm({
  category,
  initialAddonCollections,
  seo,
  initialPreview,
}: {
  category?: ExistingCategory;
  initialAddonCollections?: AddonCollectionItem[];
  /**
   * Current per-entity SEO overrides (parsed at the page boundary).
   * Not stored on ExistingCategory — parse-at-boundary pattern from
   * Batch 2/3.
   */
  seo?: { title: string; description: string };
  /**
   * SSR-prepared preview snapshot. /new passes `entityId: null`
   * to the engine for the placeholder URL; /[id] passes real id.
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
  const isEdit = !!category;

  // -- Core fields --
  const [title, setTitle] = useState(category?.title ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  // Memoized HTML strip — piped into SearchListingEditor's
  // composed-value fallback + auto-follow parent description.
  const strippedDescription = useMemo(
    () => stripHtml(description),
    [description],
  );
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? "");
  const [mediaLibOpen, setMediaLibOpen] = useState(false);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(category?.status === "ACTIVE" ? "ACTIVE" : "INACTIVE");
  const [statusOpen, setStatusOpen] = useState(false);
  const [visibleInSearch, setVisibleInSearch] = useState(category?.visibleInSearch ?? true);
  const statusRef = useRef<HTMLDivElement>(null);

  // ── SEO overrides (title + description in M6.6). Server action
  // shallow-merges over stored seo on update.
  const [seoState, setSeoState] = useState<{ title: string; description: string }>(
    () => seo ?? { title: "", description: "" },
  );
  const handleSeoChange = useCallback(
    (next: { title: string; description: string }) => {
      setSeoState(next);
    },
    [],
  );

  // -- Accommodation picker --
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<AccommodationItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerChecked, setPickerChecked] = useState<Set<string>>(new Set());
  const [pickerPage, setPickerPage] = useState(0);
  const [pickerHasMore, setPickerHasMore] = useState(true);
  const pickerScrollRef = useRef<HTMLDivElement>(null);
  const pickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Accommodations added to this category
  const [addedAccommodations, setAddedAccommodations] = useState<AccommodationItem[]>(
    () => (category?.items ?? []).map((i) => i.accommodation),
  );

  // ── Addon collections ──
  const [addonCollections, setAddonCollections] = useState<AddonCollectionItem[]>(
    () => initialAddonCollections ?? [],
  );
  const [addonPickerOpen, setAddonPickerOpen] = useState(false);
  const [addonPickerSearch, setAddonPickerSearch] = useState("");
  const [addonPickerResults, setAddonPickerResults] = useState<AddonCollectionItem[]>([]);
  const [addonPickerLoading, setAddonPickerLoading] = useState(false);
  const [addonPickerChecked, setAddonPickerChecked] = useState<Set<string>>(new Set());
  const addonPickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAddonPickerResults = useCallback(async (query: string) => {
    setAddonPickerLoading(true);
    const results = await searchProductCollections(query);
    setAddonPickerResults(results.map((r) => ({ id: r.id, title: r.title, imageUrl: r.imageUrl, status: r.status, productCount: r._count.items })));
    setAddonPickerLoading(false);
  }, []);

  const openAddonPicker = useCallback(() => {
    setAddonPickerOpen(true);
    setAddonPickerSearch("");
    setAddonPickerChecked(new Set(addonCollections.map((c) => c.id)));
    loadAddonPickerResults("");
  }, [addonCollections, loadAddonPickerResults]);

  const handleAddonPickerSearch = useCallback((query: string) => {
    setAddonPickerSearch(query);
    if (addonPickerSearchTimer.current) clearTimeout(addonPickerSearchTimer.current);
    addonPickerSearchTimer.current = setTimeout(() => {
      loadAddonPickerResults(query);
    }, 300);
  }, [loadAddonPickerResults]);

  const toggleAddonPickerItem = useCallback((id: string) => {
    setAddonPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const confirmAddonPicker = useCallback(() => {
    const selectedCollections = addonPickerResults.filter((c) => addonPickerChecked.has(c.id));
    const existingIds = new Set(addonCollections.map((c) => c.id));
    const kept = addonCollections.filter((c) => addonPickerChecked.has(c.id));
    const added = selectedCollections.filter((c) => !existingIds.has(c.id));
    setAddonCollections([...kept, ...added]);
    setAddonPickerOpen(false);
    setDirty(true);
  }, [addonPickerResults, addonPickerChecked, addonCollections]);

  const removeAddonCollection = useCallback((collectionId: string) => {
    setAddonCollections((prev) => prev.filter((c) => c.id !== collectionId));
    setDirty(true);
  }, []);

  // Load picker results
  const loadPickerResults = useCallback(async (query: string, page: number, append: boolean) => {
    setPickerLoading(true);
    const results = await searchAccommodations(query);
    if (append) {
      setPickerResults((prev) => [...prev, ...results]);
    } else {
      setPickerResults(results);
    }
    setPickerHasMore(results.length >= 20);
    setPickerLoading(false);
  }, []);

  // Open picker
  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerSearch("");
    setPickerPage(0);
    setPickerChecked(new Set(addedAccommodations.map((a) => a.id)));
    loadPickerResults("", 0, false);
  }, [addedAccommodations, loadPickerResults]);

  // Search debounce
  const handlePickerSearch = useCallback((query: string) => {
    setPickerSearch(query);
    if (pickerSearchTimer.current) clearTimeout(pickerSearchTimer.current);
    pickerSearchTimer.current = setTimeout(() => {
      setPickerPage(0);
      loadPickerResults(query, 0, false);
    }, 300);
  }, [loadPickerResults]);

  // Toggle accommodation in picker
  const togglePickerItem = useCallback((id: string) => {
    setPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Confirm picker
  const confirmPicker = useCallback(() => {
    const selectedItems = pickerResults.filter((a) => pickerChecked.has(a.id));
    const existingIds = new Set(addedAccommodations.map((a) => a.id));
    const kept = addedAccommodations.filter((a) => pickerChecked.has(a.id));
    const added = selectedItems.filter((a) => !existingIds.has(a.id));
    setAddedAccommodations([...kept, ...added]);
    setPickerOpen(false);
    setDirty(true);
  }, [pickerResults, pickerChecked, addedAccommodations]);

  // DnD for accommodation list
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setAddedAccommodations((prev) => {
      const oldIdx = prev.findIndex((a) => a.id === active.id);
      const newIdx = prev.findIndex((a) => a.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    setDirty(true);
  }, []);

  // Remove accommodation from category
  const removeAccommodation = useCallback((id: string) => {
    setAddedAccommodations((prev) => prev.filter((a) => a.id !== id));
    setDirty(true);
  }, []);

  // -- Actions dropdown --
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handle = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [statusOpen]);

  // Track dirty — skip initial hydration + data loads
  const readyRef = useRef(false);
  useEffect(() => {
    if (!readyRef.current) return;
    setDirty(true);
  }, [title, description, imageUrl, status, addedAccommodations.length, seoState]);
  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true; }, 300);
    return () => clearTimeout(t);
  }, []);

  const breadcrumbTitle = title.trim() || "Skapa boendetyp";

  // -- Save --
  const handleSave = useCallback(() => {
    setIsSaving(true);
    setSaveError(null);
    startTransition(async () => {
      const accommodationIds = addedAccommodations.map((a) => a.id);
      const seoPayload = {
        title: seoState.title,
        description: seoState.description,
      };
      const result = isEdit
        ? await updateAccommodationCategory(category!.id, {
            title,
            description,
            imageUrl: imageUrl || null,
            status,
            visibleInSearch,
            accommodationIds,
            expectedVersion: category?.version,
            seo: seoPayload,
          })
        : await createAccommodationCategory({
            title,
            description,
            imageUrl: imageUrl || null,
            status,
            visibleInSearch,
            accommodationIds,
            seo: seoPayload,
          });

      setIsSaving(false);
      if (result.ok) {
        // Save addon collections linkage
        if (isEdit) {
          await updateAccommodationCategoryAddons(category!.id, addonCollections.map((c) => c.id));
        }
        setDirty(false);
        setSavedAt(true);
        setTimeout(() => setSavedAt(false), 1500);
        if (!isEdit) {
          router.push(`/accommodation-categories/${result.data.id}`);
        } else {
          router.refresh();
        }
      } else {
        setSaveError(result.error);
        setTimeout(() => setSaveError(null), 5000);
      }
    });
  }, [title, description, imageUrl, status, visibleInSearch, addedAccommodations, addonCollections, seoState, isEdit, category, router]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setTitle(category?.title ?? "");
    setDescription(category?.description ?? "");
    setImageUrl(category?.imageUrl ?? "");
    setStatus(category?.status === "ACTIVE" ? "ACTIVE" : "INACTIVE");
    setVisibleInSearch(category?.visibleInSearch ?? true);
    setAddedAccommodations(
      (category?.items ?? []).map((i) => i.accommodation),
    );
    setAddonCollections(initialAddonCollections ?? []);
    setSeoState(seo ?? { title: "", description: "" });
    setSaveError(null);
    setTimeout(() => { setDirty(false); setIsDiscarding(false); }, 100);
  }, [category, initialAddonCollections, seo]);

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* -- Header -- */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/accommodation-categories")}
              aria-label="Tillbaka till boendetyper"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>villa</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>{breadcrumbTitle}</span>
          </h1>
          <div className="pf-header__actions">
            <button className="settings-btn--muted" disabled>Duplicera</button>
            <div style={{ position: "relative" }} ref={actionsRef}>
              <button className="settings-btn--muted" onClick={() => setActionsOpen(!actionsOpen)}>
                Fler atgarder
                <EditorIcon name="expand_more" size={16} />
              </button>
              {actionsOpen && (
                <div className="pf-actions-dropdown">
                  <button className="pf-actions-dropdown__item pf-actions-dropdown__item--danger" onClick={() => setActionsOpen(false)} disabled>
                    <EditorIcon name="delete" size={18} />
                    Radera boendetyp
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* -- Body -- */}
        <div className="pf-body">
          {/* Left column (70%) */}
          <div className="pf-main">
            <div style={CARD}>
              <div className="pf-field">
                <label className="admin-label">Titel</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="T.ex. Premium stugor"
                />
              </div>

              <div className="pf-field">
                <label className="admin-label">Beskrivning</label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Beskriv boendetypen..."
                  minHeight={120}
                  maxHeight={300}
                />
              </div>
            </div>

            {/* Accommodations in category */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Boenden</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div className="pf-collection-trigger" style={{ flex: 1 }}>
                  <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                  <input
                    type="text"
                    className="pf-collection-trigger__input"
                    placeholder="Sök boenden"
                    onFocus={openPicker}
                    readOnly
                  />
                </div>
                <button type="button" className="settings-btn--muted" onClick={openPicker}>
                  Bläddra
                </button>
              </div>
              <div style={{ borderTop: "1px solid #EBEBEB" }}>
                {addedAccommodations.length === 0 ? (
                  <p style={{ padding: "16px 0", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0, textAlign: "center" }}>
                    Inga boenden tillagda
                  </p>
                ) : (
                  <DndContext
                    sensors={dndSensors}
                    onDragStart={(e) => setDragId(String(e.active.id))}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={addedAccommodations.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                      {addedAccommodations.map((a) => (
                        <SortableAccommodationRow key={a.id} accommodation={a} onRemove={removeAccommodation} onNavigate={(id) => router.push(`/accommodations/${id}`)} />
                      ))}
                    </SortableContext>
                    {typeof document !== "undefined" && createPortal(
                      <DragOverlay>
                        {dragId && (() => {
                          const a = addedAccommodations.find((x) => x.id === dragId);
                          return a ? <AccommodationRowContent accommodation={a} /> : null;
                        })()}
                      </DragOverlay>,
                      document.body,
                    )}
                  </DndContext>
                )}
              </div>
            </div>

            {/* Tilläggsprodukter */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Tilläggsprodukter</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div className="pf-collection-trigger" style={{ flex: 1 }}>
                  <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                  <input
                    type="text"
                    className="pf-collection-trigger__input"
                    placeholder="Sök produktserier"
                    onFocus={openAddonPicker}
                    readOnly
                  />
                </div>
                <button type="button" className="settings-btn--muted" onClick={openAddonPicker}>
                  Bläddra
                </button>
              </div>
              <div style={{ borderTop: "1px solid #EBEBEB" }}>
                {addonCollections.length === 0 ? (
                  <p style={{ padding: "16px 0", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0, textAlign: "center" }}>
                    Inga produktserier tillagda
                  </p>
                ) : (
                  addonCollections.map((col) => (
                    <div key={col.id} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EBEBEB" }}>
                      {col.imageUrl ? (
                        <img src={col.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0, marginLeft: 16 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: 16 }}>
                          <EditorIcon name="work" size={16} />
                        </div>
                      )}
                      <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)", marginLeft: 12 }}>{col.title}</span>
                      <span style={{ fontSize: 12, color: "var(--admin-text-tertiary)", marginRight: 8, flexShrink: 0 }}>
                        {col.productCount} {col.productCount === 1 ? "produkt" : "produkter"}
                      </span>
                      <span className={`products-status products-status--${col.status === "ACTIVE" ? "active" : "draft"}`} style={{ marginRight: 16, flexShrink: 0 }}>
                        {col.status === "ACTIVE" ? "Aktiv" : "Utkast"}
                      </span>
                      <button
                        type="button"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-tertiary)", display: "flex", alignItems: "center", padding: 4, borderRadius: 4, flexShrink: 0 }}
                        onClick={() => removeAddonCollection(col.id)}
                        aria-label="Ta bort"
                      >
                        <EditorIcon name="close" size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Sökmotorlistning ── */}
            <SearchListingEditor
              resourceType="accommodation_category"
              entityId={isEdit && category ? category.id : null}
              value={{
                title: seoState.title || title,
                description:
                  seoState.description || strippedDescription,
                slug:
                  isEdit && category
                    ? category.slug
                    : NEW_CATEGORY_PLACEHOLDER_SLUG,
              }}
              override={{
                title: seoState.title,
                description: seoState.description,
              }}
              parentTitle={title}
              parentDescription={strippedDescription}
              onChange={handleSeoChange}
              initialPreview={initialPreview}
            />
          </div>

          {/* Right column (30%) */}
          <div className="pf-sidebar">
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
                      onClick={() => { setStatus("ACTIVE"); setStatusOpen(false); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Aktiv</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Visas på försäljningskanaler och marknader</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`admin-dropdown__item${status === "INACTIVE" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { setStatus("INACTIVE"); setStatusOpen(false); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Utkast</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Döljer boendetypen — boenden i kategorin påverkas inte</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Bild</span>
              </div>
              {imageUrl ? (
                <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                  <img src={imageUrl} alt="" style={{ width: "100%", aspectRatio: 1, objectFit: "contain", borderRadius: 8, border: "1px solid #EBEBEB" }} />
                  <button
                    type="button"
                    style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={() => setImageUrl("")}
                  >
                    <EditorIcon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <div className="pf-media-empty" style={{ padding: "62px 16px" }}>
                  <button type="button" className="pf-media-empty__btn" onClick={() => setMediaLibOpen(true)}>
                    Lägg till bild
                  </button>
                </div>
              )}
            </div>

            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Visning</span>
              </div>
              <label
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--admin-text)", margin: 0 }}
                onClick={() => { setVisibleInSearch(!visibleInSearch); setDirty(true); }}
              >
                <div
                  className={`files-header-check${visibleInSearch ? " files-header-check--active" : ""}`}
                  style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}
                >
                  <EditorIcon name="check" size={12} className="files-header-check__icon" />
                </div>
                Visa i sökformuläret
              </label>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {saveError && (
          <div className="pf-error-banner">
            <EditorIcon name="error" size={16} />
            <span>{saveError}</span>
            <button type="button" className="pf-error-banner__close" onClick={() => setSaveError(null)}>
              <EditorIcon name="close" size={14} />
            </button>
          </div>
        )}

        {/* Unsaved changes bar */}
        <PublishBarUI
          hasUnsavedChanges={dirty}
          isPublishing={isSaving}
          isDiscarding={isDiscarding}
          isLingeringAfterPublish={savedAt}
          onPublish={handleSave}
          onDiscard={handleDiscard}
        />
      </div>

      {/* Accommodation picker modal */}
      {pickerOpen && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setPickerOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, width: 560, maxHeight: "80vh", minHeight: 550,
              display: "flex", flexDirection: "column", overflow: "hidden",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", borderBottom: "1px solid #EBEBEB", background: "#f3f3f3" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Redigera boenden</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
                aria-label="Stäng"
              >
                <EditorIcon name="close" size={20} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #EBEBEB" }}>
              <div className="pf-collection-trigger">
                <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={pickerSearch}
                  onChange={(e) => handlePickerSearch(e.target.value)}
                  placeholder="Sök boenden"
                  autoFocus
                />
              </div>
            </div>

            {/* Accommodation list */}
            <div
              ref={pickerScrollRef}
              style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50 && !pickerLoading && pickerHasMore) {
                  const nextPage = pickerPage + 1;
                  setPickerPage(nextPage);
                  loadPickerResults(pickerSearch, nextPage, true);
                }
              }}
            >
              {pickerLoading && pickerResults.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`skel-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #EBEBEB" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite" }} />
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: "0.1s" }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ height: 12, borderRadius: 4, background: "#e8e8e8", width: `${60 + (i % 3) * 15}%`, animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: `${i * 0.05}s` }} />
                    </div>
                    <div style={{ width: 44, height: 20, borderRadius: 7, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: "0.15s" }} />
                  </div>
                ))
              )}
              {pickerResults.map((a) => {
                const checked = pickerChecked.has(a.id);
                return (
                  <div
                    key={a.id}
                    onClick={() => togglePickerItem(a.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 20px",
                      cursor: "pointer", borderBottom: "1px solid #EBEBEB",
                    }}
                  >
                    <div className={`files-header-check${checked ? " files-header-check--active" : ""}`} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}>
                      <EditorIcon name="check" size={12} className="files-header-check__icon" />
                    </div>
                    {a.media[0] ? (
                      <img src={a.media[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                        <EditorIcon name="image" size={16} />
                      </div>
                    )}
                    <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: "var(--admin-text)", display: "block" }}>{displayName(a)}</span>
                    </div>
                    <span className={`products-status products-status--${a.status === "ACTIVE" ? "active" : "draft"}`}>
                      {a.status === "ACTIVE" ? "Aktiv" : "Utkast"}
                    </span>
                  </div>
                );
              })}
              {pickerLoading && (
                <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                  <svg width="21" height="21" viewBox="0 0 21 21" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                    <circle cx="10.5" cy="10.5" r="7.5" stroke="var(--admin-text-tertiary)" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              {!pickerLoading && pickerResults.length === 0 && (
                <p style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0 }}>
                  Inga boenden hittades
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #EBEBEB" }}>
              <button className="settings-btn--outline" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={() => setPickerOpen(false)}>
                Avbryt
              </button>
              <button className="settings-btn--connect" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={confirmPicker}>
                Klar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Addon collection picker modal */}
      {addonPickerOpen && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setAddonPickerOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, width: 560, maxHeight: "80vh", minHeight: 550,
              display: "flex", flexDirection: "column", overflow: "hidden",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", borderBottom: "1px solid #EBEBEB", background: "#f3f3f3" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Redigera tilläggsprodukter</h3>
              <button
                type="button"
                onClick={() => setAddonPickerOpen(false)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
                aria-label="Stäng"
              >
                <EditorIcon name="close" size={20} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #EBEBEB" }}>
              <div className="pf-collection-trigger">
                <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={addonPickerSearch}
                  onChange={(e) => handleAddonPickerSearch(e.target.value)}
                  placeholder="Sök produktserier"
                  autoFocus
                />
              </div>
            </div>

            {/* Collection list */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {addonPickerLoading && addonPickerResults.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`skel-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #EBEBEB" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite" }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ height: 12, borderRadius: 4, background: "#e8e8e8", width: `${60 + (i % 3) * 15}%`, animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: `${i * 0.05}s` }} />
                    </div>
                  </div>
                ))
              )}
              {addonPickerResults.map((col) => {
                const checked = addonPickerChecked.has(col.id);
                return (
                  <div
                    key={col.id}
                    onClick={() => toggleAddonPickerItem(col.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 20px",
                      cursor: "pointer", borderBottom: "1px solid #EBEBEB",
                    }}
                  >
                    <div className={`files-header-check${checked ? " files-header-check--active" : ""}`} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}>
                      <EditorIcon name="check" size={12} className="files-header-check__icon" />
                    </div>
                    {col.imageUrl ? (
                      <img src={col.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                        <EditorIcon name="work" size={16} />
                      </div>
                    )}
                    <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)" }}>{col.title}</span>
                    <span style={{ fontSize: 12, color: "var(--admin-text-tertiary)", flexShrink: 0, marginRight: 8 }}>
                      {col.productCount} {col.productCount === 1 ? "produkt" : "produkter"}
                    </span>
                    <span className={`products-status products-status--${col.status === "ACTIVE" ? "active" : "draft"}`}>
                      {col.status === "ACTIVE" ? "Aktiv" : "Utkast"}
                    </span>
                  </div>
                );
              })}
              {addonPickerLoading && (
                <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                  <svg width="21" height="21" viewBox="0 0 21 21" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                    <circle cx="10.5" cy="10.5" r="7.5" stroke="var(--admin-text-tertiary)" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              {!addonPickerLoading && addonPickerResults.length === 0 && (
                <p style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0 }}>
                  Inga produktserier hittades
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #EBEBEB" }}>
              <button className="settings-btn--outline" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={() => setAddonPickerOpen(false)}>
                Avbryt
              </button>
              <button className="settings-btn--connect" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={confirmAddonPicker}>
                Klar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <MediaLibraryModal
        open={mediaLibOpen}
        onClose={() => setMediaLibOpen(false)}
        onConfirm={(asset: MediaLibraryResult) => { setImageUrl(asset.url); setMediaLibOpen(false); }}
        uploadFolder="accommodation-categories"
        accept="image"
      />
    </div>
  );
}

// -- Accommodation row content (shared between sortable + drag overlay) --

function AccommodationRowContent({ accommodation: a }: { accommodation: AccommodationItem }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 0", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, flexShrink: 0, color: "var(--admin-text-tertiary)", cursor: "grab" }}>
        <EditorIcon name="drag_indicator" size={16} />
      </div>
      {a.media[0] ? (
        <img src={a.media[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0, marginLeft: 16 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: 16 }}>
          <EditorIcon name="image" size={16} />
        </div>
      )}
      <div style={{ flex: "1 1 0%", marginLeft: 12, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: "var(--admin-text)", display: "block" }}>{displayName(a)}</span>
      </div>
      <span className={`products-status products-status--${a.status === "ACTIVE" ? "active" : "draft"}`} style={{ marginRight: 24, flexShrink: 0 }}>
        {a.status === "ACTIVE" ? "Aktiv" : "Utkast"}
      </span>
    </div>
  );
}

function SortableAccommodationRow({ accommodation, onRemove, onNavigate }: { accommodation: AccommodationItem; onRemove: (id: string) => void; onNavigate: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: accommodation.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EBEBEB", cursor: "pointer" }} onClick={() => onNavigate(accommodation.id)}>
      <div {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, flexShrink: 0, color: "var(--admin-text-tertiary)", cursor: "grab" }} onClick={(e) => e.stopPropagation()}>
        <EditorIcon name="drag_indicator" size={16} />
      </div>
      {accommodation.media[0] ? (
        <img src={accommodation.media[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0, marginLeft: 16 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: 16 }}>
          <EditorIcon name="image" size={16} />
        </div>
      )}
      <div style={{ flex: "1 1 0%", marginLeft: 12, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: "var(--admin-text)", display: "block" }}>{displayName(accommodation)}</span>
      </div>
      <span className={`products-status products-status--${accommodation.status === "ACTIVE" ? "active" : "draft"}`} style={{ marginRight: 24, flexShrink: 0 }}>
        {accommodation.status === "ACTIVE" ? "Aktiv" : "Utkast"}
      </span>
      <button
        type="button"
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-tertiary)", display: "flex", alignItems: "center", padding: 4, borderRadius: 4, flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); onRemove(accommodation.id); }}
        aria-label="Ta bort"
      >
        <EditorIcon name="close" size={16} />
      </button>
    </div>
  );
}
