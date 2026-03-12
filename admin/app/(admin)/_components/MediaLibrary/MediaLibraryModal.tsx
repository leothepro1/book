"use client";

import { useState, useCallback, useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import type { MediaAssetDTO } from "@/app/_lib/media/types";
import { useMediaLibrary, SORT_OPTIONS } from "@/app/(admin)/_hooks/useMediaLibrary";
import { useVideoThumb } from "@/app/_lib/cloudinary/useVideoThumb";
import "./media-library.css";

// ─── Inline upload (same as useUpload's uploadDirect) ───────

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml", "application/pdf", "video/mp4", "video/webm", "video/quicktime"];

function uploadDirect(file: File | Blob, folder: string, resourceType: "image" | "video" = "image"): Promise<{ url: string; publicId: string; width: number; height: number; bytes: number; format: string; resourceType: string }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", UPLOAD_PRESET);
    fd.append("folder", folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, true);
    xhr.onload = () => {
      if (xhr.status === 200) {
        const d = JSON.parse(xhr.responseText);
        resolve({ url: d.secure_url, publicId: d.public_id, width: d.width, height: d.height, bytes: d.bytes, format: d.format, resourceType: d.resource_type || resourceType });
      } else reject(new Error("Upload failed: " + xhr.status));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fd);
  });
}

// ─── Pending upload type ────────────────────────────────────

type PendingUpload = {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  previewUrl: string | null;
  status: "uploading" | "done" | "error";
  result?: { url: string; publicId: string; width: number; height: number; bytes: number; format: string };
};

// ─── Lazy image with IntersectionObserver ───────────────────

const LazyImage = memo(function LazyImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {inView && !loaded && <div className="ml-skeleton-shimmer" />}
      <img
        ref={imgRef}
        src={inView ? src : undefined}
        alt={alt}
        className={className}
        style={!inView ? { visibility: "hidden" } : undefined}
        onLoad={() => setLoaded(true)}
        decoding="async"
      />
    </>
  );
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC API / CONTRACT
// ═══════════════════════════════════════════════════════════════

export type MediaLibraryResult = {
  id: string;
  url: string;
  publicId: string;
  filename: string;
  width: number | null;
  height: number | null;
  mimeType: string;
};

export type MediaLibraryModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (asset: MediaLibraryResult) => void;
  /** Pre-select an asset by URL */
  currentValue?: string;
  /** Restrict listing to a folder */
  folder?: string;
  /** Subfolder within tenant (e.g. "sections", "cards"). Default: "media" */
  uploadFolder?: string;
  title?: string;
  /** Filter selectable items by media type. "image" = images only, "video" = videos only, undefined = all. */
  accept?: "image" | "video";
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function MediaLibraryModal({
  open,
  onClose,
  onConfirm,
  currentValue,
  folder,
  uploadFolder = "sections",
  title = "Mediabibliotek",
  accept,
}: MediaLibraryModalProps) {
  const { state, actions } = useMediaLibrary(open ? folder : "__disabled__");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortOpen, setSortOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [headerStuck, setHeaderStuck] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Fetch tenant slug (needed for correct Cloudinary folder path) ──
  useEffect(() => {
    if (!open || tenantSlug) return;
    fetch("/api/media/stats")
      .then((r) => r.json())
      .then((d) => { if (d.tenantSlug) setTenantSlug(d.tenantSlug); })
      .catch(() => {});
  }, [open, tenantSlug]);

  // ── Animate in/out ──
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open]);

  // ── Pre-select current value ──
  useEffect(() => {
    if (open && currentValue && state.items.length > 0 && selectedId === null) {
      const match = state.items.find((i) => i.url === currentValue || i.publicId === currentValue);
      if (match) setSelectedId(match.id);
    }
  }, [open, currentValue, state.items, selectedId]);

  // ── Reset on open ──
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      actions.setSearch("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Close dropdowns on outside click ──
  useEffect(() => {
    if (!sortOpen && !viewOpen) return;
    const handle = (e: MouseEvent) => {
      if (sortOpen && sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
      if (viewOpen && viewRef.current && !viewRef.current.contains(e.target as Node)) {
        setViewOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [sortOpen, viewOpen]);

  // ── Escape key ──
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sortOpen) setSortOpen(false);
        else if (viewOpen) setViewOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, sortOpen, viewOpen, onClose]);

  // ── Scroll pagination + sticky header shadow ──
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let ticking = false;
    const handle = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (!el) { ticking = false; return; }
        if (state.hasMore && !state.isLoadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
          actions.loadMore();
        }
        setHeaderStuck(el.scrollTop > 8);
        ticking = false;
      });
    };
    el.addEventListener("scroll", handle, { passive: true });
    return () => el.removeEventListener("scroll", handle);
  }, [state.hasMore, state.isLoadingMore, actions]);

  // ── Clean up pending items once they appear in the real list ──
  useEffect(() => {
    if (pendingUploads.length === 0 || state.isLoading) return;
    const donePendings = pendingUploads.filter((p) => p.status === "done" && p.result);
    if (donePendings.length === 0) return;

    const realPublicIds = new Set(state.items.map((i) => i.publicId));
    const toRemove = donePendings.filter((p) => p.result && realPublicIds.has(p.result.publicId));
    if (toRemove.length === 0) return;

    const idsToRemove = new Set(toRemove.map((p) => p.id));
    setPendingUploads((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
    for (const p of toRemove) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    }
  }, [pendingUploads, state.items, state.isLoading]);

  // ── Handle files (multi-file, from button or drag-drop) ──
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const folder = tenantSlug ? `hospitality/${tenantSlug}/${uploadFolder}` : `hospitality/${uploadFolder}`;
      const fileArray = Array.from(files).filter((f) => ALLOWED_UPLOAD_TYPES.includes(f.type));
      if (fileArray.length === 0) return;

      for (const file of fileArray) {
        const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isVideo = file.type.startsWith("video/");

        // Create local preview for images and videos
        let previewUrl: string | null = null;
        if (file.type.startsWith("image/") || isVideo) {
          previewUrl = URL.createObjectURL(file);
        }

        // Add pending item
        const pending: PendingUpload = {
          id,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          previewUrl,
          status: "uploading",
        };

        setPendingUploads((prev) => [pending, ...prev]);

        // Upload (use video endpoint for video files)
        uploadDirect(file, folder, isVideo ? "video" : "image")
          .then((result) => {
            setPendingUploads((prev) =>
              prev.map((p) => (p.id === id ? { ...p, status: "done" as const, result } : p))
            );

            // Index in DB, then refresh — pending item stays until real item appears in list
            fetch("/api/media/index", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: result.url, publicId: result.publicId, folder: uploadFolder, ...(isVideo && { resourceType: "video" }) }),
            })
              .catch((err) => console.warn("[MediaLibrary] Index failed:", err))
              .finally(() => actions.refresh());
          })
          .catch(() => {
            setPendingUploads((prev) =>
              prev.map((p) => (p.id === id ? { ...p, status: "error" as const } : p))
            );
          });
      }
    },
    [tenantSlug, uploadFolder, actions]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles]
  );

  // ── Confirm ──
  const handleConfirm = useCallback(() => {
    if (!selectedId) return;
    const asset = state.items.find((i) => i.id === selectedId);
    if (!asset) return;
    onConfirm({
      id: asset.id,
      url: asset.url,
      publicId: asset.publicId,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    });
  }, [selectedId, state.items, onConfirm]);

  // ── Backdrop click ──
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  // Filter items by accepted media type (for selection — upload still allows all)
  const filteredItems = accept
    ? state.items.filter((i) => {
        if (accept === "video") return i.mimeType.startsWith("video/") || i.resourceType === "video";
        if (accept === "image") return i.mimeType.startsWith("image/");
        return true;
      })
    : state.items;

  const selectedAsset = filteredItems.find((i) => i.id === selectedId);

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className={`ml-overlay ${isVisible ? "ml-overlay--open" : ""}`}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={`ml-modal ${isVisible ? "ml-modal--open" : ""}`}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ml-container">
          {/* ── Sticky Header ── */}
          <div className={`ml-sticky-header ${headerStuck ? "ml-sticky-header--stuck" : ""}`}>
          {/* ── Header ── */}
          <div className="ml-header">
            <h2 className="ml-title">{title}</h2>
            <button
              type="button"
              className="ml-close"
              onClick={onClose}
              aria-label="Stäng"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* ── Toolbar ── */}
          <div className="ml-toolbar">
            <div className="ml-toolbar-left">
              <div className="ml-search-wrap">
                <SearchIcon />
                <input
                  type="text"
                  className="ml-search"
                  placeholder="Sök media..."
                  value={state.search}
                  onChange={(e) => actions.setSearch(e.target.value)}

                />
                {state.search && (
                  <button
                    type="button"
                    className="ml-search-clear"
                    onClick={() => actions.setSearch("")}
                    aria-label="Rensa sökning"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="ml-toolbar-right">
              {/* Sort dropdown */}
              <div className="ml-sort-wrap" ref={sortRef}>
                <button
                  type="button"
                  className="ml-sort-btn"
                  onClick={() => { setSortOpen(!sortOpen); setViewOpen(false); }}
                >
                  <SortIcon />
                  <span>Sortera</span>
                </button>
                {sortOpen && (
                  <div className="ml-sort-dropdown">
                    {SORT_OPTIONS.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`ml-sort-option ${i === state.sortIndex ? "ml-sort-option--active" : ""}`}
                        onClick={() => {
                          actions.setSortIndex(i);
                          setSortOpen(false);
                        }}
                      >
                        <span>{opt.label}</span>
                        {i === state.sortIndex && <CheckIcon />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* View dropdown */}
              <div className="ml-sort-wrap" ref={viewRef}>
                <button
                  type="button"
                  className="ml-sort-btn"
                  onClick={() => { setViewOpen(!viewOpen); setSortOpen(false); }}
                  aria-label="Vy"
                >
                  {viewMode === "grid" ? <GridIcon /> : <ListIcon />}
                  <ChevronDownIcon />
                </button>
                {viewOpen && (
                  <div className="ml-sort-dropdown">
                    <button
                      type="button"
                      className={`ml-sort-option ${viewMode === "grid" ? "ml-sort-option--active" : ""}`}
                      onClick={() => { setViewMode("grid"); setViewOpen(false); }}
                    >
                      <GridIcon />
                      <span>Rutnätsvy</span>
                      {viewMode === "grid" && <CheckIcon />}
                    </button>
                    <button
                      type="button"
                      className={`ml-sort-option ${viewMode === "list" ? "ml-sort-option--active" : ""}`}
                      onClick={() => { setViewMode("list"); setViewOpen(false); }}
                    >
                      <ListIcon />
                      <span>Listvy</span>
                      {viewMode === "list" && <CheckIcon />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>{/* end ml-sticky-header */}

          {/* ── Media Grid / Content ── */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_UPLOAD_TYPES.join(",")}
            multiple
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
          <div className="ml-content" ref={gridRef}>
            {/* ── Dropzone (scrolls with content) ── */}
            <div
              className={`ml-dropzone ${isDragging ? "ml-dropzone--drag" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <button
                type="button"
                className="ml-dropzone-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Lägg till media
              </button>
              <span className="ml-dropzone-text">eller, dra och släpp här</span>
            </div>
            {state.isLoading && pendingUploads.length === 0 ? (
              <div className="ml-grid">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="ml-item ml-item--skeleton">
                    <div className="ml-item-thumb">
                      <div className="ml-skeleton-shimmer" />
                    </div>
                    <div className="ml-item-meta">
                      <div className="ml-skeleton-text" />
                    </div>
                  </div>
                ))}
              </div>
            ) : state.error && pendingUploads.length === 0 ? (
              <div className="ml-empty">
                <p className="ml-empty-text">Kunde inte hämta media</p>
                <button type="button" className="ml-empty-btn" onClick={actions.refresh}>
                  Försök igen
                </button>
              </div>
            ) : filteredItems.length === 0 && pendingUploads.length === 0 ? (
              <div className="ml-empty">
                <EmptyIcon />
                <p className="ml-empty-text">
                  {state.search
                    ? `Inga resultat för "${state.search}"`
                    : "Inga mediafiler ännu"}
                </p>
                <p className="ml-empty-sub">
                  {state.search
                    ? "Prova ett annat sökord"
                    : "Ladda upp din första fil ovan"}
                </p>
              </div>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="ml-grid">
                    {pendingUploads.map((p) => (
                      <PendingGridItem key={p.id} pending={p} />
                    ))}
                    {filteredItems.map((item) => (
                      <MediaGridItem
                        key={item.id}
                        item={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="ml-list">
                    {pendingUploads.map((p) => (
                      <PendingListItem key={p.id} pending={p} />
                    ))}
                    {filteredItems.map((item) => (
                      <MediaListItem
                        key={item.id}
                        item={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
                      />
                    ))}
                  </div>
                )}

                {state.isLoadingMore && (
                  <div className="ml-loading-more">
                    <svg className="ml-spinner" width="22" height="22" viewBox="0 0 21 21" fill="none">
                      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="ml-footer">
            <div className="ml-footer-meta">
              {!state.isLoading && (
                <span className="ml-footer-count">
                  {accept ? filteredItems.length : state.totalCount} {(accept ? filteredItems.length : state.totalCount) === 1 ? "fil" : "filer"}
                  {selectedAsset && (
                    <> &middot; <strong>{selectedAsset.filename}</strong></>
                  )}
                </span>
              )}
            </div>
            <div className="ml-footer-actions">
              <button type="button" className="ml-btn ml-btn--cancel" onClick={onClose}>
                Avbryt
              </button>
              <button
                type="button"
                className="ml-btn ml-btn--confirm"
                disabled={!selectedId}
                onClick={handleConfirm}
              >
                Välj
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// PENDING UPLOAD ITEMS
// ═══════════════════════════════════════════════════════════════

function PendingGridItem({ pending }: { pending: PendingUpload }) {
  const ext = pending.mimeType.split("/")[1]?.toUpperCase() || "";
  const sizeStr = formatBytes(pending.size);
  const isVideo = pending.mimeType.startsWith("video/");

  return (
    <div className="ml-item ml-item--pending">
      <div className="ml-item-thumb">
        {pending.previewUrl && isVideo ? (
          <>
            <video src={pending.previewUrl} className="ml-item-img" muted preload="metadata" style={{ objectFit: "cover" }} />
            <span className="ml-item-play-badge">
              <span className="material-symbols-rounded" style={{ fontSize: 28, color: "#fff", fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>play_circle</span>
            </span>
            {pending.status === "uploading" && <div className="ml-item-shimmer" />}
          </>
        ) : pending.previewUrl ? (
          <>
            <img src={pending.previewUrl} alt="" className="ml-item-img" />
            {pending.status === "uploading" && <div className="ml-item-shimmer" />}
          </>
        ) : (
          <div className="ml-item-file">
            <span className="ml-item-file-ext">{ext}</span>
            {pending.status === "uploading" && <div className="ml-item-shimmer" />}
          </div>
        )}
      </div>
      <div className="ml-item-meta">
        <span className="ml-item-name">{pending.filename}</span>
        <span className="ml-item-info">{ext} &middot; {sizeStr}</span>
      </div>
    </div>
  );
}

function PendingListItem({ pending }: { pending: PendingUpload }) {
  const ext = pending.mimeType.split("/")[1]?.toUpperCase() || "";
  const sizeStr = formatBytes(pending.size);

  return (
    <div className="ml-list-item ml-item--pending">
      <div className="ml-list-thumb">
        {pending.previewUrl ? (
          <>
            <img src={pending.previewUrl} alt="" className="ml-list-img" />
            {pending.status === "uploading" && <div className="ml-item-shimmer" />}
          </>
        ) : (
          <div className="ml-list-file-icon">
            <span>{ext}</span>
          </div>
        )}
      </div>
      <span className="ml-list-name">{pending.filename}</span>
      <span className="ml-list-detail">{ext}</span>
      <span className="ml-list-detail">{sizeStr}</span>
      <span className="ml-list-detail">{pending.status === "uploading" ? "Laddar upp..." : ""}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GRID ITEM (memoized)
// ═══════════════════════════════════════════════════════════════

/** Video thumbnail — fetches a signed Cloudinary poster image. */
const VideoThumb = memo(function VideoThumb({ src, className }: { src: string; className: string }) {
  const thumb = useVideoThumb(src);
  if (!thumb) {
    return (
      <div className={className} style={{ objectFit: "cover", background: "#e5e5e5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-rounded" style={{ fontSize: 32, color: "#999", fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}>videocam</span>
      </div>
    );
  }
  return <img src={thumb} alt="" className={className} style={{ objectFit: "cover" }} />;
});

const MediaGridItem = memo(function MediaGridItem({
  item,
  selected,
  onSelect,
}: {
  item: MediaAssetDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  const ext = item.format?.toUpperCase() || item.mimeType.split("/")[1]?.toUpperCase() || "";
  const sizeStr = formatBytes(item.bytes);
  const isVideo = item.mimeType.startsWith("video/") || item.resourceType === "video";

  return (
    <button
      type="button"
      className={`ml-item ${selected ? "ml-item--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="ml-item-thumb">
        {item.mimeType.startsWith("image/") ? (
          <LazyImage
            src={item.url}
            alt={item.alt || item.filename}
            className="ml-item-img"
          />
        ) : isVideo ? (
          <>
            <VideoThumb src={item.url} className="ml-item-img" />
            <span className="ml-item-play-badge">
              <span className="material-symbols-rounded" style={{ fontSize: 28, color: "#fff", fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>play_circle</span>
            </span>
          </>
        ) : (
          <div className="ml-item-file">
            <span className="ml-item-file-ext">{ext}</span>
          </div>
        )}
        <div className={`ml-item-check ${selected ? "ml-item-check--active" : ""}`}>
          {selected && <CheckIcon />}
        </div>
      </div>
      <div className="ml-item-meta">
        <span className="ml-item-name">{item.filename}</span>
        <span className="ml-item-info">{ext} &middot; {sizeStr}</span>
      </div>
    </button>
  );
});

// ═══════════════════════════════════════════════════════════════
// LIST ITEM (memoized)
// ═══════════════════════════════════════════════════════════════

const MediaListItem = memo(function MediaListItem({
  item,
  selected,
  onSelect,
}: {
  item: MediaAssetDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  const ext = item.format?.toUpperCase() || "";
  const sizeStr = formatBytes(item.bytes);
  const dateStr = new Date(item.createdAt).toLocaleDateString("sv-SE");
  const isVideo = item.mimeType.startsWith("video/") || item.resourceType === "video";

  return (
    <button
      type="button"
      className={`ml-list-item ${selected ? "ml-list-item--selected" : ""}`}
      onClick={onSelect}
    >
      <div className={`ml-list-check ${selected ? "ml-list-check--active" : ""}`}>
        {selected && <CheckIcon />}
      </div>
      <div className="ml-list-thumb">
        {item.mimeType.startsWith("image/") ? (
          <LazyImage src={item.url} alt={item.alt || item.filename} className="ml-list-img" />
        ) : isVideo ? (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <VideoThumb src={item.url} className="ml-list-img" />
            <span className="ml-item-play-badge ml-item-play-badge--small">
              <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#fff", fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>play_circle</span>
            </span>
          </div>
        ) : (
          <div className="ml-list-file-icon">
            <span>{ext}</span>
          </div>
        )}
      </div>
      <span className="ml-list-name">{item.filename}</span>
      <span className="ml-list-detail">{ext}</span>
      <span className="ml-list-detail">{sizeStr}</span>
      <span className="ml-list-detail">{dateStr}</span>
    </button>
  );
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════
// ICONS (inline SVGs matching existing app patterns)
// ═══════════════════════════════════════════════════════════════

function SearchIcon() {
  return (
    <svg className="ml-search-icon" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.58 3.58a.75.75 0 1 1-1.06 1.06l-3.58-3.58A7 7 0 0 1 2 9Z" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.75 4.06v7.69a.75.75 0 0 1-1.5 0v-7.69l-1.72 1.72a.749.749 0 1 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0l3 3a.749.749 0 1 1-1.06 1.06z" />
      <path d="M11.75 4.25a.75.75 0 0 0-1.5 0v7.69l-1.72-1.72a.749.749 0 1 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.749.749 0 1 0-1.06-1.06l-1.72 1.72z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" d="M3.72 6.47a.75.75 0 0 1 1.06 0l3.47 3.47 3.47-3.47a.749.749 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" fillRule="evenodd">
      <path d="M1.5 3.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zm2-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5" />
      <path d="M1.5 10.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zm2-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5" />
      <path d="M10.5 1.5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2zm2 1.5h-2a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5" />
      <path d="M8.5 10.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zm2-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2" />
      <path d="M2 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2" />
      <path d="M3 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
      <path d="M5.25 2.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z" />
      <path d="M4.5 8a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75" />
      <path d="M5.25 12.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="ml-empty-icon">
      <path d="m2.25 15.75 5.16-5.16a2.25 2.25 0 0 1 3.18 0l5.16 5.16m-1.5-1.5 1.41-1.41a2.25 2.25 0 0 1 3.18 0l2.41 2.41m-18 3.68h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
