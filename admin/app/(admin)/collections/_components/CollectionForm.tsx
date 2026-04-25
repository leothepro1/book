"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { createCollection, updateCollection, searchProducts, listCollections } from "@/app/_lib/products";
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

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

type ExistingCollection = {
  id: string;
  title: string;
  description: string;
  slug: string;
  imageUrl: string | null;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  items: Array<{ product: { id: string; title: string; media: Array<{ url: string }> } }>;
};

// ── /new-flow placeholder slug ───────────────────────────────
// Mirrors NEW_ENTITY_PLACEHOLDER_SLUG.product_collection in the
// preview engine; kept inline rather than exported so the engine's
// map stays the sole authority for URL synthesis.
const NEW_COLLECTION_PLACEHOLDER_SLUG = "ny-produktserie";

export default function CollectionForm({
  collection,
  seo,
  initialPreview,
}: {
  collection?: ExistingCollection;
  /**
   * Current per-entity SEO overrides (parsed at the page boundary
   * via `safeParseSeoMetadata`). Not stored on `ExistingCollection`
   * to avoid widening that type with an untyped JSON field — parse-
   * at-boundary pattern from Batch 2/3.
   */
  seo?: { title: string; description: string; noindex?: boolean };
  /**
   * SSR-prepared preview snapshot. Both /new and /[id] compute this
   * server-side — /new passes `entityId: null` to get the placeholder
   * URL; /[id] passes the real entity id.
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
  const isEdit = !!collection;

  // ── Core fields ──
  const [title, setTitle] = useState(collection?.title ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  // Memoized HTML strip — piped into SearchListingEditor as the
  // composed-value fallback + auto-follow parent description.
  const strippedDescription = useMemo(
    () => stripHtml(description),
    [description],
  );
  const [imageUrl, setImageUrl] = useState(collection?.imageUrl ?? "");
  const [mediaLibOpen, setMediaLibOpen] = useState(false);
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">(collection?.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // ── SEO overrides (title + description + noindex from M6.6c; OG
  // image ships later). Server action shallow-merges over stored seo
  // so future fields carry through unchanged. `noindex` is controlled
  // by the Synlighet sidebar card (separate from SearchListingEditor).
  const [seoState, setSeoState] = useState<{
    title: string;
    description: string;
    noindex: boolean;
  }>(() => ({
    title: seo?.title ?? "",
    description: seo?.description ?? "",
    noindex: seo?.noindex ?? false,
  }));
  const handleSeoChange = useCallback(
    (next: { title: string; description: string }) => {
      setSeoState((prev) => ({
        ...prev,
        title: next.title,
        description: next.description,
      }));
    },
    [],
  );
  // Kept for the next noindex UI surface — see ProductForm comment.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNoindexChange = useCallback((noindex: boolean) => {
    setSeoState((prev) => ({ ...prev, noindex }));
  }, []);

  // ── Product picker ──
  type ProductItem = { id: string; title: string; status: string; price: number; currency: string; media: Array<{ url: string }> };
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<ProductItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerChecked, setPickerChecked] = useState<Set<string>>(new Set());
  const [pickerPage, setPickerPage] = useState(0);
  const [pickerHasMore, setPickerHasMore] = useState(true);
  const pickerScrollRef = useRef<HTMLDivElement>(null);
  const pickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Products added to this collection
  const [addedProducts, setAddedProducts] = useState<ProductItem[]>(
    () => (collection?.items ?? []).map((i) => ({
      id: i.product.id,
      title: i.product.title,
      status: "ACTIVE",
      price: 0,
      currency: "SEK",
      media: i.product.media,
    })),
  );

  // Load picker results
  const loadPickerResults = useCallback(async (query: string, page: number, append: boolean) => {
    setPickerLoading(true);
    const results = await searchProducts(query);
    if (append) {
      setPickerResults((prev) => [...prev, ...results]);
    } else {
      setPickerResults(results);
    }
    setPickerHasMore(results.length >= 20);
    setPickerLoading(false);
  }, []);

  // Open picker
  const openProductPicker = useCallback(() => {
    setProductPickerOpen(true);
    setPickerSearch("");
    setPickerPage(0);
    setPickerChecked(new Set(addedProducts.map((p) => p.id)));
    loadPickerResults("", 0, false);
  }, [addedProducts, loadPickerResults]);

  // Search debounce
  const handlePickerSearch = useCallback((query: string) => {
    setPickerSearch(query);
    if (pickerSearchTimer.current) clearTimeout(pickerSearchTimer.current);
    pickerSearchTimer.current = setTimeout(() => {
      setPickerPage(0);
      loadPickerResults(query, 0, false);
    }, 300);
  }, [loadPickerResults]);

  // Toggle product in picker
  const togglePickerProduct = useCallback((id: string) => {
    setPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Confirm picker
  const confirmPicker = useCallback(() => {
    const selectedProducts = pickerResults.filter((p) => pickerChecked.has(p.id));
    // Merge: keep existing that are still checked, add new ones
    const existingIds = new Set(addedProducts.map((p) => p.id));
    const kept = addedProducts.filter((p) => pickerChecked.has(p.id));
    const added = selectedProducts.filter((p) => !existingIds.has(p.id));
    setAddedProducts([...kept, ...added]);
    setProductPickerOpen(false);
    setDirty(true);
  }, [pickerResults, pickerChecked, addedProducts]);

  // DnD for product list
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [productDragId, setProductDragId] = useState<string | null>(null);

  const handleProductDragEnd = useCallback((e: DragEndEvent) => {
    setProductDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setAddedProducts((prev) => {
      const oldIdx = prev.findIndex((p) => p.id === active.id);
      const newIdx = prev.findIndex((p) => p.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    setDirty(true);
  }, []);

  // Remove product from collection
  const removeProduct = useCallback((id: string) => {
    setAddedProducts((prev) => prev.filter((p) => p.id !== id));
    setDirty(true);
  }, []);

  // ── Actions dropdown ──
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
  }, [title, description, imageUrl, status, addedProducts.length, seoState]);
  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true; }, 300);
    return () => clearTimeout(t);
  }, []);

  const breadcrumbTitle = title.trim() || "Skapa produktserie";

  // ── Save ──
  const handleSave = useCallback(() => {
    setIsSaving(true);
    setSaveError(null);
    startTransition(async () => {
      const productIds = addedProducts.map((p) => p.id);
      const seoPayload = {
        title: seoState.title,
        description: seoState.description,
        noindex: seoState.noindex,
      };
      const result = isEdit
        ? await updateCollection(collection!.id, { title, description, imageUrl: imageUrl || null, status, productIds, seo: seoPayload })
        : await createCollection({ title, description, imageUrl: imageUrl || null, status, productIds, seo: seoPayload });

      setIsSaving(false);
      if (result.ok) {
        setDirty(false);
        setSavedAt(true);
        setTimeout(() => setSavedAt(false), 1500);
        if (!isEdit) {
          router.push(`/collections/${result.data.id}`);
        } else {
          router.refresh();
        }
      } else {
        setSaveError(result.error);
        setTimeout(() => setSaveError(null), 5000);
      }
    });
  }, [title, description, imageUrl, status, addedProducts, seoState, isEdit, collection, router]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setTitle(collection?.title ?? "");
    setDescription(collection?.description ?? "");
    setImageUrl(collection?.imageUrl ?? "");
    setStatus(collection?.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
    setAddedProducts(
      (collection?.items ?? []).map((i) => ({
        id: i.product.id, title: i.product.title, status: "ACTIVE",
        price: 0, currency: "SEK", media: i.product.media,
      })),
    );
    setSeoState({
      title: seo?.title ?? "",
      description: seo?.description ?? "",
      noindex: seo?.noindex ?? false,
    });
    setSaveError(null);
    setTimeout(() => { setDirty(false); setIsDiscarding(false); }, 100);
  }, [collection, seo]);

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* ── Header ── */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/collections")}
              aria-label="Tillbaka till produktserier"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>work</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>{breadcrumbTitle}</span>
          </h1>
          <div className="pf-header__actions">
            <button className="settings-btn--muted" disabled>Duplicera</button>
            <div style={{ position: "relative" }} ref={actionsRef}>
              <button className="settings-btn--muted" onClick={() => setActionsOpen(!actionsOpen)}>
                Fler åtgärder
                <EditorIcon name="expand_more" size={16} />
              </button>
              {actionsOpen && (
                <div className="pf-actions-dropdown">
                  <button className="pf-actions-dropdown__item pf-actions-dropdown__item--danger" onClick={() => setActionsOpen(false)} disabled>
                    <EditorIcon name="delete" size={18} />
                    Radera produktserie
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
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
                  placeholder="T.ex. Mat & Dryck"
                />
              </div>

              <div className="pf-field">
                <label className="admin-label">Beskrivning</label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Beskriv produktserien..."
                  minHeight={120}
                  maxHeight={300}
                />
              </div>

            </div>

            {/* Products in collection */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Produkter</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div className="pf-collection-trigger" style={{ flex: 1 }}>
                  <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                  <input
                    type="text"
                    className="pf-collection-trigger__input"
                    placeholder="Sök produkter"
                    onFocus={openProductPicker}
                    readOnly
                  />
                </div>
                <button type="button" className="settings-btn--muted" onClick={openProductPicker}>
                  Bläddra
                </button>
              </div>
              <div style={{ borderTop: "1px solid #EBEBEB" }}>
                {addedProducts.length === 0 ? (
                  <p style={{ padding: "16px 0", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0, textAlign: "center" }}>
                    Inga produkter tillagda
                  </p>
                ) : (
                  <DndContext
                    sensors={dndSensors}
                    onDragStart={(e) => setProductDragId(String(e.active.id))}
                    onDragEnd={handleProductDragEnd}
                  >
                    <SortableContext items={addedProducts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                      {addedProducts.map((p) => (
                        <SortableProductRow key={p.id} product={p} onRemove={removeProduct} onNavigate={(id) => router.push(`/products/${id}`)} />
                      ))}
                    </SortableContext>
                    {typeof document !== "undefined" && createPortal(
                      <DragOverlay>
                        {productDragId && (() => {
                          const p = addedProducts.find((x) => x.id === productDragId);
                          return p ? <ProductRowContent product={p} /> : null;
                        })()}
                      </DragOverlay>,
                      document.body,
                    )}
                  </DndContext>
                )}
              </div>
            </div>

            {/* ── Sökmotorlistning ── */}
            <SearchListingEditor
              resourceType="product_collection"
              entityId={isEdit && collection ? collection.id : null}
              value={{
                title: seoState.title || title,
                description:
                  seoState.description || strippedDescription,
                slug:
                  isEdit && collection
                    ? collection.slug
                    : NEW_COLLECTION_PLACEHOLDER_SLUG,
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
                      className={`admin-dropdown__item${status === "DRAFT" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { setStatus("DRAFT"); setStatusOpen(false); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Utkast</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Döljer produktserien — produkter i serien påverkas inte</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Synlighet UI removed — noindex state + save wiring kept. */}

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

      {/* Product picker modal */}
      {productPickerOpen && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setProductPickerOpen(false)}
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
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Redigera produkter</h3>
              <button
                type="button"
                onClick={() => setProductPickerOpen(false)}
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
                  placeholder="Sök produkter"
                  autoFocus
                />
              </div>
            </div>

            {/* Product list */}
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
              {pickerResults.map((p) => {
                const checked = pickerChecked.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => togglePickerProduct(p.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 20px",
                      cursor: "pointer", borderBottom: "1px solid #EBEBEB",
                    }}
                  >
                    <div className={`files-header-check${checked ? " files-header-check--active" : ""}`} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}>
                      <EditorIcon name="check" size={12} className="files-header-check__icon" />
                    </div>
                    {p.media[0] ? (
                      <img src={p.media[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                        <EditorIcon name="image" size={16} />
                      </div>
                    )}
                    <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)" }}>{p.title}</span>
                    <span className={`products-status products-status--${p.status === "ACTIVE" ? "active" : "draft"}`}>
                      {p.status === "ACTIVE" ? "Aktiv" : "Utkast"}
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
                  Inga produkter hittades
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #EBEBEB" }}>
              <button className="settings-btn--outline" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={() => setProductPickerOpen(false)}>
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

      <MediaLibraryModal
        open={mediaLibOpen}
        onClose={() => setMediaLibOpen(false)}
        onConfirm={(asset: MediaLibraryResult) => { setImageUrl(asset.url); setMediaLibOpen(false); }}
        uploadFolder="collections"
        accept="image"
      />
    </div>
  );
}

// ── Product row content (shared between sortable + drag overlay) ──

type RowProduct = { id: string; title: string; status: string; media: Array<{ url: string }> };

function ProductRowContent({ product: p }: { product: RowProduct }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 0", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, flexShrink: 0, color: "var(--admin-text-tertiary)", cursor: "grab" }}>
        <EditorIcon name="drag_indicator" size={16} />
      </div>
      {p.media[0] ? (
        <img src={p.media[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0, marginLeft: 16 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: 16 }}>
          <EditorIcon name="image" size={16} />
        </div>
      )}
      <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)", marginLeft: 12 }}>{p.title}</span>
      <span className={`products-status products-status--${p.status === "ACTIVE" ? "active" : "draft"}`} style={{ marginRight: 24, flexShrink: 0 }}>
        {p.status === "ACTIVE" ? "Aktiv" : "Utkast"}
      </span>
    </div>
  );
}

function SortableProductRow({ product, onRemove, onNavigate }: { product: RowProduct; onRemove: (id: string) => void; onNavigate: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EBEBEB", cursor: "pointer" }} onClick={() => onNavigate(product.id)}>
      <div {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, flexShrink: 0, color: "var(--admin-text-tertiary)", cursor: "grab" }} onClick={(e) => e.stopPropagation()}>
        <EditorIcon name="drag_indicator" size={16} />
      </div>
      {product.media[0] ? (
        <img src={product.media[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0, marginLeft: 16 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: 16 }}>
          <EditorIcon name="image" size={16} />
        </div>
      )}
      <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)", marginLeft: 12 }}>{product.title}</span>
      <span className={`products-status products-status--${product.status === "ACTIVE" ? "active" : "draft"}`} style={{ marginRight: 24, flexShrink: 0 }}>
        {product.status === "ACTIVE" ? "Aktiv" : "Utkast"}
      </span>
      <button
        type="button"
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-tertiary)", display: "flex", alignItems: "center", padding: 4, borderRadius: 4, flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); onRemove(product.id); }}
        aria-label="Ta bort"
      >
        <EditorIcon name="close" size={16} />
      </button>
    </div>
  );
}
