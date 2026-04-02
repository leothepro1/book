"use client";

/**
 * PageResourcePicker — Generic resource picker for page templates.
 * ════════════════════════════════════════════════════════════════
 *
 * Shopify pattern: each template shows a resource picker under the page name.
 * Product templates → "Change product". Collection templates → "Change collection".
 *
 * Popup rendered via createPortal — same pattern as FieldMenuPicker (fmp-popup).
 * Positioned next to the sidebar, anchored to the trigger element.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { PagePreviewResource } from "@/app/_lib/pages/types";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  getProductSummaries,
  getCollectionSummaries,
  getAccommodationSummaries,
} from "@/app/_lib/products/actions";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type ResourceItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: string;
};

type Props = {
  resource: PagePreviewResource;
  pageId: string;
};

const PAGE_SIZE = 15;

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function PageResourcePicker({ resource, pageId }: Props) {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupTop, setPopupTop] = useState(0);

  // Fetch items on mount based on picker type
  useEffect(() => {
    setSelectedId("");
    setLoaded(false);

    const fetcher = FETCHER_MAP[resource.pickerType];
    if (!fetcher) { setLoaded(true); return; }

    fetcher()
      .then((data) => {
        setItems(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
          notifyPreview(resource.dataKey, data[0].id);
        }
        setLoaded(true);
      })
      .catch(() => { setItems([]); setLoaded(true); });
  }, [pageId, resource.pickerType, resource.dataKey]);

  // Reset pagination when popup opens or search changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [open, search]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setSearch(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const openPopup = useCallback(() => {
    if (triggerRef.current) {
      setPopupTop(triggerRef.current.getBoundingClientRect().top);
    }
    setOpen(true);
    setSearch("");
    setVisibleCount(PAGE_SIZE);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setOpen(false);
    setSearch("");
    notifyPreview(resource.dataKey, id);
  }, [resource.dataKey]);

  const selected = items.find((i) => i.id === selectedId);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return items;
    return items.filter((i) => i.title.toLowerCase().includes(query));
  }, [items, query]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  if (!loaded) return null;
  if (items.length === 0) return null;

  const popupContent = open && typeof document !== "undefined" && createPortal(
    <div
      className="sp-resource-popup"
      ref={popupRef}
      style={{ top: popupTop }}
    >
      {/* Search — identical to pk-popup (PickerModal) */}
      <div className="pk-popup__search">
        <svg className="pk-popup__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.5 11.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input
          type="text"
          className="pk-popup__search-input"
          placeholder="Sök…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        {search && (
          <button type="button" className="pk-popup__search-clear" onClick={() => setSearch("")}>
            <EditorIcon name="close" size={14} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="sp-resource-popup__list">
        {filtered.length === 0 ? (
          <div className="sp-resource-popup__empty">Inga resultat</div>
        ) : (
          <>
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sp-resource-popup__item${item.id === selectedId ? " sp-resource-popup__item--active" : ""}`}
                onClick={() => handleSelect(item.id)}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="sp-resource-popup__item-img" />
                ) : (
                  <div className="sp-resource-popup__item-img sp-resource-popup__item-img--empty">
                    <EditorIcon name="image" size={12} />
                  </div>
                )}
                <span className="sp-resource-popup__item-title">{item.title}</span>
                {item.status === "DRAFT" && (
                  <span className="sp-resource-popup__badge">Utkast</span>
                )}
                {item.id === selectedId && (
                  <EditorIcon name="check" size={16} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
                )}
              </button>
            ))}
            {hasMore && (
              <button
                type="button"
                className="sp-resource-popup__more"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                <EditorIcon name="expand_more" size={16} />
                <span>Visa mer</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="sp-resource-picker">
      <button
        ref={triggerRef}
        type="button"
        className="sp-resource-picker__trigger"
        onClick={() => open ? setOpen(false) : openPopup()}
      >
        {selected?.imageUrl && (
          <img src={selected.imageUrl} alt="" className="sp-resource-picker__thumb" />
        )}
        <span className="sp-resource-picker__trigger-text">
          <span className="sp-resource-picker__label">{resource.label}</span>
          <span className="sp-resource-picker__value">
            {selected?.title ?? "Välj…"}
          </span>
        </span>
        <EditorIcon name="unfold_more" size={16} className="sp-resource-picker__icon" />
      </button>
      {popupContent}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FETCHER REGISTRY
// ═══════════════════════════════════════════════════════════════

const FETCHER_MAP: Record<string, () => Promise<ResourceItem[]>> = {
  productPicker: async () => {
    const summaries = await getProductSummaries();
    return summaries.map((s) => ({
      id: s.id,
      title: s.title,
      imageUrl: s.imageUrl,
      status: s.status,
    }));
  },
  collectionPicker: async () => {
    const summaries = await getCollectionSummaries();
    return summaries.map((s) => ({
      id: s.id,
      title: s.title,
      imageUrl: s.imageUrl,
      status: s.status,
    }));
  },
  accommodationPicker: async () => {
    const summaries = await getAccommodationSummaries();
    return summaries.map((s) => ({
      id: s.id,
      title: s.title,
      imageUrl: s.imageUrl,
      status: "ACTIVE",
    }));
  },
};

// ═══════════════════════════════════════════════════════════════
// PREVIEW IFRAME SYNC
// ═══════════════════════════════════════════════════════════════

function notifyPreview(dataKey: string, resourceId: string) {
  const iframe = document.querySelector<HTMLIFrameElement>(
    ".admin-preview iframe, .preview-widget iframe",
  );
  if (!iframe?.src) return;

  window.dispatchEvent(new CustomEvent("preview-resource-change"));

  const url = new URL(iframe.src, window.location.origin);
  url.searchParams.set(dataKey, resourceId);
  iframe.src = url.toString();
}
