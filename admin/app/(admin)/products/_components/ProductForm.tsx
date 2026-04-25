"use client";

/**
 * ProductForm — Shared create/edit form for products.
 * Used by /products/new and /products/[id].
 *
 * Layout:
 *   Header: breadcrumb (←  sell > Skapa produkt) + action buttons
 *   Body: 70/30 two-column layout
 *     Left (70%):
 *       Card 1: Title + Description (rich text) + Media
 *       Card 2: Variants (options + variant table)
 *     Right (30%):
 *       (future: status, collections, tax, etc.)
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import { createProduct, updateProduct, archiveProduct, deleteProduct, effectivePrice, listCollections, assignProductTemplate } from "@/app/_lib/products";
import { listProductTemplates } from "@/app/_lib/products/template-actions";
import type { ProductMediaInput, ProductOptionInput, ProductVariantInput } from "@/app/_lib/products";
import { SearchListingEditor } from "@/app/(admin)/_components/SearchListingEditor";
import type { SeoPreviewResult } from "@/app/_lib/seo/preview";
import { stripHtml } from "@/app/_lib/seo/text";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./product-form.css";
import "../../menus/menus.css";

// ── Option with ID (for DnD) ─────────────────────────────────
type OptionWithId = ProductOptionInput & { id: string };
let optionSeq = 0;
function makeOptionId(): string { return `opt_${Date.now()}_${++optionSeq}`; }

// ── Media with ID (for DnD) ──────────────────────────────────
type MediaWithId = ProductMediaInput & { _id: string };
let mediaSeq = 0;
function makeMediaId(): string { return `med_${Date.now()}_${++mediaSeq}`; }

// ── Card style (matches menus/files pattern) ─────────────────
const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

// ── Props ────────────────────────────────────────────────────
type ExistingProduct = {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  productType: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  taxable: boolean;
  trackInventory: boolean;
  inventoryQuantity: number;
  continueSellingWhenOutOfStock: boolean;
  version: number;
  media: Array<{ url: string; type: string; alt: string; filename: string; width: number | null; height: number | null }>;
  options: Array<{ name: string; values: unknown; sortOrder: number }>;
  variants: Array<{ option1: string | null; option2: string | null; option3: string | null; imageUrl: string | null; price: number; compareAtPrice: number | null; sku: string | null; trackInventory: boolean; inventoryQuantity: number; continueSellingWhenOutOfStock: boolean }>;
  collectionItems: Array<{ collection: { id: string; title: string } }>;
  tags?: Array<{ tag: { id: string; name: string } }>;
};

// ── /new-flow placeholder slug ───────────────────────────────
// Shown in the SearchListingEditor's read-only URL input when no
// product row exists yet. Mirrors NEW_ENTITY_PLACEHOLDER_SLUG.product
// in the preview engine; kept inline here rather than exported so
// the engine's map stays the sole authority for URL synthesis.
const NEW_PRODUCT_PLACEHOLDER_SLUG = "ny-produkt";

export default function ProductForm({
  product,
  basePath = "/products",
  seo,
  initialPreview,
}: {
  product?: ExistingProduct;
  basePath?: string;
  /**
   * Current per-entity SEO overrides (parsed at the page boundary
   * via `safeParseSeoMetadata`). Not stored on `ExistingProduct` to
   * avoid widening that type with an untyped JSON field — the
   * parse-at-boundary pattern matches Batch 2's AccommodationForm.
   */
  seo?: { title: string; description: string; noindex?: boolean };
  /**
   * SSR-prepared preview snapshot for the first render. Both /new
   * and /[id] compute this server-side — /new passes entityId=null
   * to the engine and gets a `ny-produkt` placeholder URL.
   */
  initialPreview?: SeoPreviewResult;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false); // linger after save
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mark dirty on any change
  const markDirty = useCallback(() => setDirty(true), []);

  // ── SEO overrides (title + description + noindex; OG image lands
  // later). Server action shallow-merges incoming with stored seo so
  // fields this form doesn't edit survive every save. `noindex` is
  // controlled by the Synlighet sidebar card, NOT the SearchListingEditor
  // (Shopify pattern: "what Google shows" and "should Google index"
  // are separate concerns).
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
      // SLE only owns title + description. Functional setState
      // preserves the merchant's noindex choice across re-renders.
      setSeoState((prev) => ({
        ...prev,
        title: next.title,
        description: next.description,
      }));
      markDirty();
    },
    [markDirty],
  );

  // Kept for the next noindex UI surface (the previous Synlighet card
  // was removed — see PreferencesContent comment for the same pattern).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNoindexChange = useCallback(
    (noindex: boolean) => {
      setSeoState((prev) => ({ ...prev, noindex }));
      markDirty();
    },
    [markDirty],
  );

  const isEdit = !!product;
  // ── Slug state (M11.3) ──
  //
  // The SearchListingEditor's slug input is now editable. We track the
  // current slug + validity here so handleSave can: (a) refuse to save
  // while the slug fails the regex, and (b) intercept with a redirect-
  // warning modal when an existing entity's slug actually changed.
  // Initial value mirrors what flowed into SLE pre-M11.3 — saved slug
  // for existing products, /new placeholder otherwise.
  const initialSlug = isEdit && product
    ? product.slug
    : NEW_PRODUCT_PLACEHOLDER_SLUG;
  const [slugState, setSlugState] = useState(initialSlug);
  const [slugIsValid, setSlugIsValid] = useState(true);
  const [showSlugWarning, setShowSlugWarning] = useState(false);

  const handleSlugChange = useCallback(
    (next: { slug: string; isValid: boolean }) => {
      setSlugState(next.slug);
      setSlugIsValid(next.isValid);
      // Don't mark the form dirty just because AUTO mode bubbled the
      // title-derived slug back up — the title field already drove
      // markDirty when it changed. Only USER edits that actually
      // diverge from the persisted slug should signal "unsaved".
      if (isEdit && product && next.slug !== product.slug) {
        markDirty();
      }
    },
    [isEdit, product, markDirty],
  );
  // ── Core fields (pre-populated from product when editing) ──
  const [title, setTitle] = useState(product?.title ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  // Memoize the stripped description — `stripHtml` runs once per
  // description keystroke otherwise, and rich-text editor output can
  // be hundreds of chars. The SearchListingEditor consumes this as
  // the composed-value fallback.
  const strippedDescription = useMemo(
    () => stripHtml(description),
    [description],
  );
  // Display in kronor (DB stores öre — divide by 100 for display, multiply by 100 for save)
  const [price, setPrice] = useState<number>(Math.round((product?.price ?? 0) / 100));
  const [compareAtPrice, setCompareAtPrice] = useState<number>(Math.round((product?.compareAtPrice ?? 0) / 100));
  const [taxable, setTaxable] = useState(product?.taxable ?? true);
  const [priceExtrasOpen, setPriceExtrasOpen] = useState(false);
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">(product?.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<MediaWithId[]>(
    () => (product?.media ?? []).map((m) => ({ ...m, type: m.type as "image" | "video", _id: makeMediaId() })),
  );
  const [mediaLibOpen, setMediaLibOpen] = useState(false);
  const [mediaDragId, setMediaDragId] = useState<string | null>(null);
  const mediaSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Tags ──
  const [tags, setTags] = useState<string[]>(
    () => (product?.tags ?? []).map((t) => t.tag.name),
  );
  const [tagInput, setTagInput] = useState("");

  const addTag = useCallback((raw: string) => {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    setTags((prev) => prev.includes(name) ? prev : [...prev, name]);
    setTagInput("");
  }, []);

  const removeTag = useCallback((name: string) => {
    setTags((prev) => prev.filter((t) => t !== name));
  }, []);

  // ── Collections ──
  type CollectionItem = { id: string; title: string };
  const [allCollections, setAllCollections] = useState<CollectionItem[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(
    () => new Set((product?.collectionItems ?? []).map((ci) => ci.collection.id)),
  );
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collectionsSearch, setCollectionsSearch] = useState("");
  const collectionsRef = useRef<HTMLDivElement>(null);

  // ── Templates ──
  type TemplateItem = { id: string; name: string; suffix: string; isDefault: boolean };
  const [allTemplates, setAllTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    () => (product as any)?.templateId ?? null,
  );
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);

  // ── Options + Variants (pre-populated from product) ──
  const [options, setOptions] = useState<OptionWithId[]>(
    () => (product?.options ?? []).map((o) => ({
      id: makeOptionId(),
      name: o.name,
      values: Array.isArray(o.values) ? o.values as string[] : [],
    })),
  );
  const [variants, setVariants] = useState<ProductVariantInput[]>(
    () => (product?.variants ?? []).map((v) => ({
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
      imageUrl: v.imageUrl ?? null,
      price: Math.round(v.price / 100),
      compareAtPrice: v.compareAtPrice ? Math.round(v.compareAtPrice / 100) : undefined,
      sku: v.sku ?? undefined,
      trackInventory: v.trackInventory,
      inventoryQuantity: v.inventoryQuantity,
      continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
    })),
  );
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Actions dropdown ──
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Load collections + templates on mount
  useEffect(() => {
    listCollections().then((cols) => {
      setAllCollections(cols.map((c) => ({ id: c.id, title: c.title })));
    });
    listProductTemplates().then((tpls) => {
      setAllTemplates(tpls.map((t) => ({ id: t.id, name: t.name, suffix: t.suffix, isDefault: t.isDefault })));
    });
  }, []);

  // Close collections dropdown on outside click
  useEffect(() => {
    if (!collectionsOpen) return;
    const handle = (e: MouseEvent) => {
      if (collectionsRef.current && !collectionsRef.current.contains(e.target as Node)) setCollectionsOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [collectionsOpen]);

  // Track dirty state — only after the form has stabilised (skip initial hydration + data loads)
  const readyRef = useRef(false);
  const mediaCount = media.length;
  const optionsCount = options.length;
  const variantsCount = variants.length;
  const collectionsCount = selectedCollectionIds.size;
  const tagsCount = tags.length;
  useEffect(() => {
    if (!readyRef.current) return;
    setDirty(true);
  }, [title, description, price, compareAtPrice, taxable, status, mediaCount, optionsCount, variantsCount, collectionsCount, tagsCount]);
  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true; }, 300);
    return () => clearTimeout(t);
  }, []);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handle = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [statusOpen]);

  // Close template dropdown on outside click
  useEffect(() => {
    if (!templateDropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) setTemplateDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [templateDropdownOpen]);

  // Collection toggle
  const toggleCollection = useCallback((id: string) => {
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const removeCollection = useCallback((id: string) => {
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Breadcrumb title (live update)
  const breadcrumbTitle = title.trim() || "Skapa produkt";

  // ── Media handling ──
  const handleMediaSelectMulti = useCallback((assets: MediaLibraryResult[]) => {
    setMedia((prev) => {
      const existingUrls = new Set(prev.map((m) => m.url));
      const newItems = assets
        .filter((a) => !existingUrls.has(a.url))
        .map((a) => ({ _id: makeMediaId(), url: a.url, type: "image" as const, alt: "", filename: a.filename ?? "", width: a.width ?? null, height: a.height ?? null }));
      return [...prev, ...newItems];
    });
    setMediaLibOpen(false);
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((m) => m._id !== id));
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
  }, []);

  // ── Options handling ──
  const addOption = useCallback(() => {
    const id = makeOptionId();
    setOptions((prev) => [...prev, { id, name: "", values: [] }]);
    setEditingOptionId(id);
  }, [options.length]);

  const updateOption = useCallback((id: string, patch: Partial<ProductOptionInput>) => {
    setOptions((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } : o));
  }, []);

  const removeOption = useCallback((id: string) => {
    setOptions((prev) => prev.filter((o) => o.id !== id));
    setEditingOptionId(null);
    setVariants([]);
  }, []);

  const handleOptionDragStart = useCallback((e: DragStartEvent) => {
    setDragActiveId(String(e.active.id));
  }, []);

  const handleOptionDragEnd = useCallback((e: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOptions((prev) => {
      const oldIdx = prev.findIndex((o) => o.id === active.id);
      const newIdx = prev.findIndex((o) => o.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  // ── Generate variants from options ──
  const generateVariants = useCallback(() => {
    const validOptions = options.filter((o) => o.name && o.values.length > 0);
    if (validOptions.length === 0) { setVariants([]); return; }

    const combos: string[][] = [[]];
    for (const opt of validOptions) {
      const next: string[][] = [];
      for (const combo of combos) {
        for (const val of opt.values) {
          next.push([...combo, val]);
        }
      }
      combos.length = 0;
      combos.push(...next);
    }

    setVariants((prev) => {
      // Preserve existing variant data (image, price, inventory) when regenerating
      const existingMap = new Map(
        prev.map((v) => [`${v.option1}|${v.option2}|${v.option3}`, v]),
      );
      return combos.map((combo) => {
        const key = `${combo[0] ?? ""}|${combo[1] ?? ""}|${combo[2] ?? ""}`;
        const existing = existingMap.get(key);
        return {
          option1: combo[0] ?? null,
          option2: combo[1] ?? null,
          option3: combo[2] ?? null,
          imageUrl: existing?.imageUrl ?? null,
          price: existing?.price ?? 0,
          compareAtPrice: existing?.compareAtPrice ?? undefined,
          sku: existing?.sku ?? undefined,
          trackInventory: existing?.trackInventory ?? false,
          inventoryQuantity: existing?.inventoryQuantity ?? 0,
          continueSellingWhenOutOfStock: existing?.continueSellingWhenOutOfStock ?? false,
        };
      });
    });
  }, [options]);

  const updateVariantPrice = useCallback((index: number, price: number) => {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, price } : v));
  }, []);

  const updateVariantInventory = useCallback((index: number, qty: number) => {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, inventoryQuantity: qty, trackInventory: true } : v));
  }, []);

  const updateVariantImage = useCallback((index: number, imageUrl: string | null) => {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, imageUrl } : v));
  }, []);

  // Track which variant is selecting an image
  const [variantMediaIndex, setVariantMediaIndex] = useState<number | null>(null);

  // ── Save ──
  //
  // Two-step flow:
  //   handleSave()  — gates on slug validity, then either intercepts
  //                   with the redirect-warning modal (existing entity
  //                   + slug actually changed) or runs executeSave()
  //                   directly.
  //   executeSave() — the actual server-action call. Closing the
  //                   warning modal and confirming both end here.
  const executeSave = useCallback(() => {
    setIsSaving(true);
    setSaveError(null);
    startTransition(async () => {
      const payload = {
            title,
            description,
            media: media.map(({ _id, ...m }) => m),
            options: options.filter((o) => o.name && o.values.length > 0),
            variants: variants.map((v) => ({
              ...v,
              price: Math.round(v.price * 100),
              compareAtPrice: v.compareAtPrice ? Math.round(v.compareAtPrice * 100) : undefined,
            })),
            status,
            price: Math.round(price * 100),
            compareAtPrice: compareAtPrice ? Math.round(compareAtPrice * 100) : undefined,
            currency: product?.currency ?? "SEK",
            taxable,
            trackInventory: product?.trackInventory ?? false,
            inventoryQuantity: product?.inventoryQuantity ?? 0,
            continueSellingWhenOutOfStock: product?.continueSellingWhenOutOfStock ?? false,
            collectionIds: Array.from(selectedCollectionIds),
            tags,
            seo: {
              title: seoState.title,
              description: seoState.description,
              noindex: seoState.noindex,
            },
          };

      let result;
      if (isEdit) {
        result = await updateProduct(product!.id, { ...payload, expectedVersion: product!.version });
      } else {
        result = await createProduct(payload as Parameters<typeof createProduct>[0]);
      }

      setIsSaving(false);
      if (result.ok) {
        setDirty(false);
        setSavedAt(true);
        setTimeout(() => setSavedAt(false), 1500);
        if (!isEdit) {
          router.push(`${basePath}/${result.data.id}`);
        } else {
          router.refresh();
        }
      } else {
        setSaveError(result.error);
        setTimeout(() => setSaveError(null), 5000);
      }
    });
  }, [title, description, price, compareAtPrice, taxable, status, media, options, variants, selectedCollectionIds, tags, seoState, router, isEdit, product, basePath]);

  const handleSave = useCallback(() => {
    if (!slugIsValid) {
      setSaveError("URL-användarnamnet är ogiltigt. Korrigera fältet innan du sparar.");
      setTimeout(() => setSaveError(null), 5000);
      return;
    }
    // Redirect warning fires only when editing an existing product
    // AND the merchant's slug differs from what's persisted. The /new
    // flow has no old URL to redirect from, and unchanged slugs need
    // no warning.
    if (isEdit && product && slugState !== product.slug) {
      setShowSlugWarning(true);
      return;
    }
    executeSave();
  }, [slugIsValid, isEdit, product, slugState, executeSave]);

  const handleConfirmSlugChange = useCallback(() => {
    setShowSlugWarning(false);
    executeSave();
  }, [executeSave]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setTitle(product?.title ?? "");
    setDescription(product?.description ?? "");
    setPrice(Math.round((product?.price ?? 0) / 100));
    setCompareAtPrice(Math.round((product?.compareAtPrice ?? 0) / 100));
    setTaxable(product?.taxable ?? true);
    setStatus(product?.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
    setMedia(product?.media
      ? product.media.map((m) => ({ ...m, type: m.type as "image" | "video", _id: makeMediaId() }))
      : [],
    );
    setOptions(product?.options
      ? product.options.map((o) => ({ id: makeOptionId(), name: o.name, values: Array.isArray(o.values) ? o.values as string[] : [] }))
      : [],
    );
    setVariants(product?.variants
      ? product.variants.map((v) => ({
          option1: v.option1 ?? null, option2: v.option2 ?? null, option3: v.option3 ?? null,
          imageUrl: v.imageUrl ?? null, price: v.price, compareAtPrice: v.compareAtPrice ?? undefined,
          sku: v.sku ?? undefined, trackInventory: v.trackInventory,
          inventoryQuantity: v.inventoryQuantity, continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
        }))
      : [],
    );
    setSelectedCollectionIds(new Set((product?.collectionItems ?? []).map((ci) => ci.collection.id)));
    setTags((product?.tags ?? []).map((t) => t.tag.name));
    setTagInput("");
    setSeoState({
      title: seo?.title ?? "",
      description: seo?.description ?? "",
      noindex: seo?.noindex ?? false,
    });
    setSlugState(initialSlug);
    setSlugIsValid(true);
    setTimeout(() => {
      setDirty(false);
      setIsDiscarding(false);
    }, 100);
  }, [product, seo, initialSlug]);

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* ── Header ── */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push(basePath)}
              aria-label="Tillbaka till produkter"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>sell</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>{breadcrumbTitle}</span>
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
                      if (!product?.id) return;
                      if (!confirm("Vill du arkivera denna produkt? Den kan återställas senare.")) return;
                      const result = await archiveProduct(product.id);
                      if (result.ok) {
                        router.push("/products");
                      } else {
                        alert(result.error);
                      }
                    }}
                    disabled={!product?.id}
                  >
                    <EditorIcon name="archive" size={18} />
                    Arkivera produkt
                  </button>
                  <button
                    className="pf-actions-dropdown__item pf-actions-dropdown__item--danger"
                    onClick={async () => {
                      setActionsOpen(false);
                      if (!product?.id) return;
                      if (!confirm("Vill du permanent radera denna produkt? Detta kan inte ångras.")) return;
                      const result = await deleteProduct(product.id);
                      if (result.ok) {
                        router.push("/products");
                      } else {
                        alert(result.error);
                      }
                    }}
                    disabled={!product?.id}
                  >
                    <EditorIcon name="delete" size={18} />
                    Radera produkt
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
            {/* Card 1: Title + Description + Media */}
            <div style={CARD}>
              <div className="pf-field">
                <label className="admin-label">Titel</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="T.ex. Frukostbuffé"
                />
              </div>

              <div className="pf-field">
                <label className="admin-label">Beskrivning</label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Beskriv produkten..."
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
            </div>

            {/* Card 2: Price */}
            <div style={{ ...CARD, padding: 0 }}>
              <div style={{ padding: 16 }}>
                <div className="pf-card-header" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="pf-card-title">Pris</span>
                </div>
                <div className="pf-price-input-wrap">
                  <input
                    type="number"
                    className="pf-price-input"
                    value={price || ""}
                    onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
                    placeholder="0,00"
                  />
                  <span className="pf-price-input-suffix">kr</span>
                </div>
              </div>

              {/* Expandable panel */}
              <div className={`pf-price-extras${priceExtrasOpen ? " pf-price-extras--open" : ""}`}>
                <div className="pf-price-extras__inner">
                  <label className="mi-card__field-label">Jämförpris</label>
                  <div className="pf-price-input-wrap" style={{ marginBottom: 16 }}>
                    <input
                      type="number"
                      className="pf-price-input"
                      value={compareAtPrice || ""}
                      onChange={(e) => setCompareAtPrice(parseInt(e.target.value) || 0)}
                      placeholder="0,00"
                    />
                    <span className="pf-price-input-suffix">kr</span>
                  </div>

                  <label
                    className="pf-checkbox-row"
                    onClick={() => setTaxable(!taxable)}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={taxable}
                      className={`files-header-check${taxable ? " files-header-check--active" : ""}`}
                    >
                      <EditorIcon name="check" size={14} className="files-header-check__icon" />
                    </button>
                    <span className="pf-checkbox-label">Ta ut moms på den här produkten</span>
                  </label>
                </div>
              </div>

              {/* Footer with pills */}
              <div className="pf-price-footer">
                <div className="pf-price-footer__pills">
                  <span className="pf-price-pill">
                    Jämförpris
                    {compareAtPrice > 0 && <span className="pf-price-pill__value">{compareAtPrice} kr</span>}
                  </span>
                  <span className="pf-price-pill">
                    Ta ut moms
                    <span className="pf-price-pill__value">{taxable ? "Ja" : "Nej"}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="pf-price-footer__toggle"
                  onClick={() => setPriceExtrasOpen(!priceExtrasOpen)}
                  aria-label="Visa ytterligare priser"
                >
                  <EditorIcon
                    name="expand_more"
                    size={20}
                    style={{ transform: priceExtrasOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s ease" }}
                  />
                </button>
              </div>
            </div>

            {/* Card 3: Variants */}
            <div style={{ ...CARD, padding: 0 }}>
              <div className="pf-card-header" style={{ padding: "16px 16px 12px" }}>
                <span className="pf-card-title">Varianter</span>
              </div>

              {options.length === 0 ? (
                <div style={{ padding: "0 16px 16px" }}>
                  <button type="button" className="pf-add-option-btn" onClick={addOption}>
                    <EditorIcon name="add_circle" size={16} />
                    Lägg till alternativ som storlek eller färg
                  </button>
                </div>
              ) : (
                <>
                  {/* DnD option cards — connected list */}
                  <DndContext
                    sensors={sensors}
                    onDragStart={handleOptionDragStart}
                    onDragEnd={handleOptionDragEnd}
                  >
                    <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
                      <div className="pf-option-list">
                        {options.map((opt, idx) => {
                          const isFirst = idx === 0;
                          const hasFooter = true;
                          const isLast = idx === options.length - 1;
                          const isOnly = options.length === 1;

                          let radius: string;
                          if (isOnly && !hasFooter) radius = "8px";
                          else if (isFirst) radius = "8px 8px 0 0";
                          else if (isLast && !hasFooter) radius = "0 0 8px 8px";
                          else radius = "0";

                          return (
                            <SortableOptionCard
                              key={opt.id}
                              option={opt}
                              editing={editingOptionId === opt.id}
                              onEdit={() => setEditingOptionId(opt.id)}
                              onDoneEdit={() => { setEditingOptionId(null); generateVariants(); }}
                              onDelete={() => removeOption(opt.id)}
                              onUpdate={(patch) => updateOption(opt.id, patch)}
                              borderRadius={radius}
                              showBottomBorder={isLast && !hasFooter}
                            />
                          );
                        })}
                        {(
                          <div className="pf-option-list__footer" onClick={addOption}>
                            <EditorIcon name="add_circle" size={16} />
                            <span>Lägg till alternativ</span>
                          </div>
                        )}
                      </div>
                    </SortableContext>
                    {typeof document !== "undefined" && createPortal(
                      <DragOverlay>
                        {dragActiveId && (() => {
                          const opt = options.find((o) => o.id === dragActiveId);
                          return opt ? (
                            <OptionCard
                              option={opt}
                              editing={false}
                              onEdit={() => {}}
                              onDoneEdit={() => {}}
                              onDelete={() => {}}
                              onUpdate={() => {}}
                            />
                          ) : null;
                        })()}
                      </DragOverlay>,
                      document.body,
                    )}
                  </DndContext>

                  {/* Variant table */}
                  {variants.length > 0 && (
                    <div className="pf-variant-table">
                      <div className="pf-variant-header">
                        <span className="pf-variant-col pf-variant-col--img">Variant</span>
                        <span className="pf-variant-col pf-variant-col--name" />
                        <span className="pf-variant-col pf-variant-col--price">Pris</span>
                        <span className="pf-variant-col pf-variant-col--stock">Lager</span>
                      </div>
                      {variants.map((v, vi) => {
                        const label = [v.option1, v.option2, v.option3].filter(Boolean).join(" / ");
                        return (
                          <div key={vi} className="pf-variant-row">
                            <div className="pf-variant-col pf-variant-col--img">
                              {v.imageUrl ? (
                                <div className="pf-variant-img" onClick={() => setVariantMediaIndex(vi)}>
                                  <img src={v.imageUrl} alt="" className="pf-variant-img__src" />
                                </div>
                              ) : (
                                <div className="pf-variant-img pf-variant-img--empty" onClick={() => setVariantMediaIndex(vi)}>
                                  <EditorIcon name="add_photo_alternate" size={18} />
                                </div>
                              )}
                            </div>
                            <span className="pf-variant-col pf-variant-col--name">{label}</span>
                            <div className="pf-variant-col pf-variant-col--price">
                              <div className="pf-variant-input-wrap">
                                <input
                                  type="number"
                                  className={`pf-variant-input${!v.price ? " pf-variant-input--inherited" : ""}`}
                                  value={v.price || ""}
                                  onChange={(e) => updateVariantPrice(vi, parseInt(e.target.value) || 0)}
                                  placeholder={price ? String(price) : "0"}
                                />
                                <span className="pf-variant-input-suffix">kr</span>
                              </div>
                            </div>
                            <div className="pf-variant-col pf-variant-col--stock">
                              <input
                                type="number"
                                className="pf-variant-input"
                                value={v.inventoryQuantity || ""}
                                onChange={(e) => updateVariantInventory(vi, parseInt(e.target.value) || 0)}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Sökmotorlistning ──
                Compose-at-parent: `value.*` shows what Google
                would render right now (override wins; fallback
                to live parent form state). `override.*` is the
                raw merchant-typed payload that will persist on
                save. */}
            <SearchListingEditor
              resourceType="product"
              entityId={isEdit && product ? product.id : null}
              value={{
                title: seoState.title || title,
                description:
                  seoState.description || strippedDescription,
                slug: slugState,
              }}
              override={{
                title: seoState.title,
                description: seoState.description,
              }}
              parentTitle={title}
              parentDescription={strippedDescription}
              onChange={handleSeoChange}
              onSlugChange={handleSlugChange}
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
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Säljs via försäljningskanaler och marknader</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`admin-dropdown__item${status === "DRAFT" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { setStatus("DRAFT"); setStatusOpen(false); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Utkast</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Visas inte på försäljningskanaler eller marknader</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar: Synlighet (M6.6) — search-engine indexing
                control. UI removed — `seoState.noindex` + handler +
                save/discard wiring kept for a future surface. */}

            {/* Sidebar: Sales analytics */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Försäljning</span>
              </div>
              <p style={{ fontSize: 13, color: "#616161", margin: 0, lineHeight: 1.5 }}>
                Ingen nylig försäljning av den här produkten
              </p>
            </div>

            {/* Sidebar: Template */}
            {isEdit && (
              <div style={CARD}>
                <div className="pf-card-header" style={{ marginBottom: 8 }}>
                  <span className="pf-card-title">Produktmall</span>
                </div>
                {allTemplates.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#616161", margin: 0, lineHeight: 1.5 }}>
                    Inga produktmallar skapade.{" "}
                    <a href="/products/templates" style={{ color: "var(--admin-accent)" }}>Skapa en mall</a>
                  </p>
                ) : (
                  <div className="admin-dropdown" ref={templateRef}>
                    <button
                      type="button"
                      className="admin-dropdown__trigger"
                      onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
                    >
                      <span className="admin-dropdown__text" style={{ textAlign: "left" }}>
                        {selectedTemplateId
                          ? (allTemplates.find((t) => t.id === selectedTemplateId)?.name ?? "Standard")
                          : "Standard (ingen mall)"}
                      </span>
                      <EditorIcon name="expand_more" size={18} className="admin-dropdown__chevron" />
                    </button>
                    {templateDropdownOpen && (
                      <div className="admin-dropdown__list">
                        <div
                          className={`admin-dropdown__item${!selectedTemplateId ? " admin-dropdown__item--active" : ""}`}
                          onClick={() => {
                            setSelectedTemplateId(null);
                            setTemplateDropdownOpen(false);
                            if (product) assignProductTemplate(product.id, null);
                          }}
                        >
                          Standard (ingen mall)
                          {!selectedTemplateId && <span className="admin-dropdown__check">✓</span>}
                        </div>
                        {allTemplates.map((t) => (
                          <div
                            key={t.id}
                            className={`admin-dropdown__item${selectedTemplateId === t.id ? " admin-dropdown__item--active" : ""}`}
                            onClick={() => {
                              setSelectedTemplateId(t.id);
                              setTemplateDropdownOpen(false);
                              if (product) assignProductTemplate(product.id, t.id);
                            }}
                          >
                            {t.name}{t.isDefault ? " (standard)" : ""}
                            {selectedTemplateId === t.id && <span className="admin-dropdown__check">✓</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sidebar: Product organization */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Produktorganisering</span>
              </div>

              <label className="mi-card__field-label" style={{ marginBottom: 6, display: "block", fontWeight: 400 }}>Produktserier</label>
              <div className="admin-dropdown" ref={collectionsRef}>
                <div className="pf-collection-trigger" onClick={() => setCollectionsOpen(true)}>
                  <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                  <input
                    type="text"
                    className="pf-collection-trigger__input"
                    value={collectionsSearch}
                    onChange={(e) => { setCollectionsSearch(e.target.value); setCollectionsOpen(true); }}
                    onFocus={() => setCollectionsOpen(true)}
                    placeholder=""
                  />
                </div>
                {collectionsOpen && (
                  <div className="admin-dropdown__list" style={{ padding: 0 }}>
                    <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px" }}>
                      {allCollections
                        .filter((c) => !collectionsSearch || c.title.toLowerCase().includes(collectionsSearch.toLowerCase()))
                        .map((col) => {
                          const checked = selectedCollectionIds.has(col.id);
                          return (
                            <button
                              key={col.id}
                              type="button"
                              className="admin-dropdown__item"
                              onClick={() => toggleCollection(col.id)}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span className={`fac-check${checked ? " fac-check--on" : ""}`}>
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </span>
                                <span style={{ fontSize: 13 }}>{col.title}</span>
                              </div>
                            </button>
                          );
                        })}
                      {allCollections.filter((c) => !collectionsSearch || c.title.toLowerCase().includes(collectionsSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--admin-text-tertiary)" }}>
                          Inga produktserier hittades
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedCollectionIds.size > 0 && (
                <div className="pf-collection-pills">
                  {Array.from(selectedCollectionIds).map((id) => {
                    const col = allCollections.find((c) => c.id === id);
                    if (!col) return null;
                    return (
                      <span key={id} className="pf-collection-pill">
                        {col.title}
                        <button
                          type="button"
                          className="pf-collection-pill__remove"
                          onClick={() => removeCollection(id)}
                          aria-label={`Ta bort ${col.title}`}
                        >
                          <EditorIcon name="close" size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Tags */}
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

      {/* Media library modal */}
      <MediaLibraryModal
        open={mediaLibOpen}
        onClose={() => setMediaLibOpen(false)}
        onConfirm={() => {}}
        onConfirmMulti={handleMediaSelectMulti}
        multiSelect
        uploadFolder="products"
        accept="image"
      />
      <MediaLibraryModal
        open={variantMediaIndex !== null}
        onClose={() => setVariantMediaIndex(null)}
        onConfirm={(asset: MediaLibraryResult) => {
          if (variantMediaIndex !== null) {
            updateVariantImage(variantMediaIndex, asset.url);
            setVariantMediaIndex(null);
          }
        }}
        uploadFolder="products/variants"
        accept="image"
      />

      {/* Slug-change warning — fires when an existing product's URL is
          edited. Mirrors the createPortal pattern used by the product
          picker + collection delete confirmations. Confirm proceeds
          with the same executeSave path as a normal save. */}
      {showSlugWarning && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowSlugWarning(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, width: 460, padding: 24,
              display: "flex", flexDirection: "column", gap: 16,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Ändra webbadress?</h3>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--admin-text-secondary)", margin: 0 }}>
              Om du ändrar webbadressen skapas en automatisk 301-omdirigering från den gamla adressen. Befintliga länkar kommer fortsätta fungera.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="settings-btn--outline"
                onClick={() => setShowSlugWarning(false)}
                disabled={isPending}
              >
                Avbryt
              </button>
              <button
                type="button"
                className="settings-btn--connect"
                onClick={handleConfirmSlugChange}
                disabled={isPending}
              >
                Spara och omdirigera
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Option Card (DnD, mirrors mi-card from menus) ───────────

function OptionCard({
  option,
  editing,
  onEdit,
  onDoneEdit,
  onDelete,
  onUpdate,
  dragHandleProps,
  borderRadius = "8px",
  showBottomBorder = true,
}: {
  option: OptionWithId;
  editing: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<ProductOptionInput>) => void;
  dragHandleProps?: Record<string, unknown>;
  borderRadius?: string;
  showBottomBorder?: boolean;
}) {
  return (
    <div
      className={`pf-option-card${editing ? " pf-option-card--editing" : " pf-option-card-collapsed"}`}
      style={{
        borderRadius,
        borderBottom: showBottomBorder ? undefined : "none",
      }}
    >
      <div className="mi-card__row" style={editing ? { alignItems: "flex-start" } : undefined}>
        <div className="mi-card__handle" style={editing ? { height: 36, marginTop: 22 } : undefined} {...(dragHandleProps ?? {})}>
          <EditorIcon name="drag_indicator" size={20} />
        </div>
        {editing ? (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div className="mi-card__inline-edit" style={{ flex: 1, minWidth: 0 }}>
              <div className="mi-card__inline-field">
                <label className="mi-card__field-label">Alternativnamn</label>
                <input
                  type="text"
                  className="menus-items__input"
                  value={option.name}
                  onChange={(e) => onUpdate({ name: e.target.value })}
                  placeholder="T.ex. Tid"
                  autoFocus
                />
              </div>
              <div className="mi-card__inline-field">
                <label className="mi-card__field-label">Alternativvärden</label>
                <OptionValuesList
                  values={option.values}
                  onChange={(values) => onUpdate({ values })}
                />
              </div>
            </div>
            <div className="pf-option-footer">
              <button type="button" className="pf-option-footer__delete" onClick={onDelete}>
                Radera
              </button>
              <button type="button" className="settings-btn--connect" style={{ fontSize: 13, padding: "5px 14px" }} onClick={onDoneEdit}>
                Klar
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}
            onClick={onEdit}
          >
            <span className="mi-card__label">{option.name || "Utan namn"}</span>
            {option.values.length > 0 && (
              <div className="pf-value-badges">
                {option.values.map((v, i) => (
                  <span key={i} className="pf-value-badge">{v}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Option Values List (DnD individual inputs) ──────────────

type ValueItem = { id: string; value: string };
let valSeq = 0;
function makeValId(): string { return `val_${Date.now()}_${++valSeq}`; }

function valuesToItems(values: string[]): ValueItem[] {
  const items = values.map((v) => ({ id: makeValId(), value: v }));
  items.push({ id: makeValId(), value: "" }); // trailing empty input
  return items;
}

function OptionValuesList({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [items, setItems] = useState<ValueItem[]>(() => valuesToItems(values));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);

  const commit = useCallback((updated: ValueItem[]) => {
    onChange(updated.filter((i) => i.value.trim()).map((i) => i.value.trim()));
  }, [onChange]);

  const handleChange = useCallback((id: string, value: string) => {
    setItems((prev) => {
      const next = prev.map((i) => i.id === id ? { ...i, value } : i);
      // If the last item now has text, add a new empty one
      const last = next[next.length - 1];
      if (last && last.value.trim()) {
        next.push({ id: makeValId(), value: "" });
      }
      commit(next);
      return next;
    });
  }, [commit]);

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      // Ensure there's always a trailing empty
      const last = next[next.length - 1];
      if (!last || last.value.trim()) {
        next.push({ id: makeValId(), value: "" });
      }
      commit(next);
      return next;
    });
  }, [commit]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id);
      const newIdx = prev.findIndex((i) => i.id === over.id);
      const next = arrayMove(prev, oldIdx, newIdx);
      commit(next);
      return next;
    });
  }, [commit]);

  // Only draggable items are non-empty ones
  const draggableIds = items.filter((i) => i.value.trim()).map((i) => i.id);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragId(String(e.active.id))}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={draggableIds} strategy={verticalListSortingStrategy}>
        <div className="pf-values-list">
          {items.map((item, idx) => {
            const isEmpty = !item.value.trim();
            const isLast = idx === items.length - 1;
            return isEmpty && !isLast ? null : (
              <SortableValueRow
                key={item.id}
                item={item}
                isEmpty={isEmpty}
                onChange={handleChange}
                onRemove={handleRemove}
              />
            );
          })}
        </div>
      </SortableContext>
      {typeof document !== "undefined" && createPortal(
        <DragOverlay>
          {dragId && (() => {
            const item = items.find((i) => i.id === dragId);
            return item ? <ValueRowContent item={item} isEmpty={false} /> : null;
          })()}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function ValueRowContent({ item, isEmpty }: { item: ValueItem; isEmpty: boolean }) {
  return (
    <div className="pf-value-row">
      {!isEmpty && (
        <div className="pf-value-row__handle">
          <EditorIcon name="drag_indicator" size={16} />
        </div>
      )}
      {isEmpty && <div className="pf-value-row__handle-spacer" />}
      <div className="pf-value-row__input-wrap">
        <input
          type="text"
          className="pf-value-row__input"
          value={item.value}
          readOnly
          placeholder="Lägg till värde"
        />
        {!isEmpty && (
          <span className="pf-value-row__remove">
            <EditorIcon name="close" size={14} />
          </span>
        )}
      </div>
    </div>
  );
}

function SortableValueRow({ item, isEmpty, onChange, onRemove }: {
  item: ValueItem; isEmpty: boolean;
  onChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: isEmpty });
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, transition }
    : { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="pf-value-row">
      {!isEmpty ? (
        <div className="pf-value-row__handle" {...attributes} {...listeners}>
          <EditorIcon name="drag_indicator" size={16} />
        </div>
      ) : (
        <div className="pf-value-row__handle-spacer" />
      )}
      <div className="pf-value-row__input-wrap">
        <input
          type="text"
          className="pf-value-row__input"
          value={item.value}
          onChange={(e) => onChange(item.id, e.target.value)}
          placeholder="Lägg till värde"
        />
        {!isEmpty && (
          <button
            type="button"
            className="pf-value-row__remove"
            onClick={() => onRemove(item.id)}
            aria-label="Ta bort värde"
          >
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function SortableOptionCard(props: {
  option: OptionWithId;
  editing: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<ProductOptionInput>) => void;
  borderRadius: string;
  showBottomBorder: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.option.id });
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, transition }
    : { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      <OptionCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Sortable Media Cell ─────────────────────────────────────

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
