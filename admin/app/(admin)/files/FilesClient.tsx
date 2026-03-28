"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import { EditorIcon } from "@/app/_components/EditorIcon";

const PAGE_SIZE = 50;

export default function FilesClient({
  onUploadRef,
}: {
  onUploadRef: React.MutableRefObject<(() => void) | null>;
}) {
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const selectDropdownRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{
    selectAll: (ids: string[]) => void;
    clearAll: () => void;
    getPageItemIds: () => string[];
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, totalCount);
  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;

  const handleTotalCount = useCallback((count: number) => setTotalCount(count), []);
  const handleSelectionChange = useCallback((ids: Set<string>) => setSelectedIds(ids), []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSelectDropdown) return;
    const handle = (e: MouseEvent) => {
      if (selectDropdownRef.current && !selectDropdownRef.current.contains(e.target as Node)) setShowSelectDropdown(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSelectDropdown]);

  // Checkbox in column header — select all / deselect all on current page
  const handleHeaderCheckbox = () => {
    if (!selectionRef.current) return;
    const pageIds = selectionRef.current.getPageItemIds();
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    if (allPageSelected || hasSelection) {
      selectionRef.current.clearAll();
      setShowOnlySelected(false);
    } else {
      selectionRef.current.selectAll(pageIds);
    }
  };

  // Determine checkbox state
  const pageIds = selectionRef.current?.getPageItemIds() ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = hasSelection && !allPageSelected;

  // Build dynamic column header — always interactive checkbox
  const dynamicHeader = hasSelection ? (
    <div className="files-column-headers files-column-headers--selection">
      <button
        type="button"
        role="checkbox"
        aria-checked={allPageSelected ? "true" : someSelected ? "mixed" : "false"}
        className={`files-header-check ${someSelected ? "files-header-check--partial" : allPageSelected ? "files-header-check--active" : ""}`}
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name={someSelected ? "remove" : "check"} size={14} className="files-header-check__icon" />
      </button>
      <span className="files-selection__label">
        {selCount} {selCount === 1 ? "vald" : "valda"}
      </span>

      {/* Select dropdown */}
      <div style={{ position: "relative" }} ref={selectDropdownRef}>
        <button
          className="files-selection__chevron"
          onClick={() => setShowSelectDropdown(!showSelectDropdown)}
        >
          <EditorIcon name="expand_more" size={18} />
        </button>
        {showSelectDropdown && (
          <div className="files-selection__dropdown">
            <button
              className="files-selection__dropdown-item"
              onClick={() => {
                if (selectionRef.current) {
                  selectionRef.current.selectAll(selectionRef.current.getPageItemIds());
                }
                setShowSelectDropdown(false);
              }}
            >
              Markera alla {Math.min(PAGE_SIZE, totalCount)} på sidan
            </button>
            <button
              className="files-selection__dropdown-item"
              onClick={() => {
                selectionRef.current?.clearAll();
                setShowOnlySelected(false);
                setShowSelectDropdown(false);
              }}
            >
              Avmarkera alla
            </button>
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        className="files-selection__delete"
        onClick={() => setShowDeleteConfirm(true)}
      >
        Ta bort {selCount === 1 ? "fil" : "filer"}
      </button>

      {/* Show only selected toggle */}
      <div className="files-selection__filter" onClick={() => setShowOnlySelected(!showOnlySelected)}>
        <button
          type="button"
          role="switch"
          aria-checked={showOnlySelected}
          className={`sf-toggle${showOnlySelected ? " sf-toggle--on" : ""}`}
        >
          <span className="sf-toggle__icon sf-toggle__icon--check material-symbols-rounded">check</span>
          <span className="sf-toggle__icon sf-toggle__icon--remove material-symbols-rounded">remove</span>
          <span className="sf-toggle__thumb" />
        </button>
        <span>Visa alla valda</span>
      </div>
    </div>
  ) : (
    <div className="files-column-headers">
      <button
        type="button"
        role="checkbox"
        aria-checked="false"
        className="files-header-check"
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name="check" size={14} className="files-header-check__icon" />
      </button>
      <span className="ml-column-headers__thumb" />
      <span className="ml-column-headers__name">Filnamn</span>
      <span className="ml-column-headers__detail">Filtyp</span>
      <span className="ml-column-headers__detail">Storlek</span>
      <span className="ml-column-headers__detail">Tillagd</span>
    </div>
  );

  return (
    <div className="files-inner">
      <MediaLibraryModal
        open={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title=""
        uploadFolder="media"
        mode="inline"
        uploadTriggerRef={onUploadRef}
        selectionRef={selectionRef}
        page={page}
        pageSize={PAGE_SIZE}
        onTotalCount={handleTotalCount}
        onSelectionChange={handleSelectionChange}
        filterToIds={showOnlySelected ? selectedIds : null}
        slotAfterToolbar={dynamicHeader}
      />

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="files-pagination">
          <div className="files-pagination__nav">
            <button
              className="files-pagination__btn"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Föregående sida"
            >
              <EditorIcon name="chevron_left" size={20} />
            </button>
            <button
              className="files-pagination__btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Nästa sida"
            >
              <EditorIcon name="chevron_right" size={20} />
            </button>
          </div>
          <span className="files-pagination__label">
            {start} – {end}
          </span>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Ta bort {selCount === 1 ? "1 fil" : `${selCount} filer`}?
            </h3>
            <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 20 }}>
              {selCount === 1 ? "Filen" : "Filerna"} tas bort permanent och kan inte återställas.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowDeleteConfirm(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                onClick={async () => {
                  // TODO: implement actual delete via API
                  setShowDeleteConfirm(false);
                  selectionRef.current?.clearAll();
                  setShowOnlySelected(false);
                }}
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
