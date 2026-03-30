"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { listAccommodationCategories, deleteAccommodationCategory } from "./actions";

type AccCategoryListItem = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  _count: { items: number };
};

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "ACTIVE": return { label: "Aktiv", className: "products-status--active" };
    case "INACTIVE": return { label: "Utkast", className: "products-status--draft" };
    default: return { label: status, className: "" };
  }
}

export default function AccommodationCategoriesClient({
  onAddRef,
}: {
  onAddRef: React.MutableRefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<AccCategoryListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const selectDropdownRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Load categories
  useEffect(() => {
    listAccommodationCategories().then((data) => {
      setCategories(data as AccCategoryListItem[]);
      setLoaded(true);
    });
  }, []);

  // Wire up add button
  useEffect(() => {
    onAddRef.current = () => router.push("/accommodation-categories/new");
    return () => { onAddRef.current = null; };
  }, [onAddRef, router]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSelectDropdown) return;
    const handle = (e: MouseEvent) => {
      if (selectDropdownRef.current && !selectDropdownRef.current.contains(e.target as Node)) setShowSelectDropdown(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSelectDropdown]);

  // Selection logic
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(categories.map((c) => c.id)));
  }, [categories]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;
  const allSelected = categories.length > 0 && selCount === categories.length;
  const someSelected = hasSelection && !allSelected;

  const handleHeaderCheckbox = () => {
    if (allSelected || hasSelection) clearAll(); else selectAll();
  };

  const handleDeleteSelected = useCallback(() => {
    startTransition(async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await deleteAccommodationCategory(id);
      }
      setCategories((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    });
  }, [selectedIds]);

  const filteredCategories = statusFilter === "ALL"
    ? categories
    : categories.filter((c) => c.status === statusFilter);

  if (!loaded) return null;

  // -- Empty state --
  if (categories.length === 0) {
    return (
      <div className="products-empty">
        <div className="products-empty__icon">
          <EditorIcon name="category" size={48} />
        </div>
        <h2 className="products-empty__title">Inga boendetyper annu</h2>
        <p className="products-empty__desc">
          Skapa din forsta boendetyp — Stugor, Hotellrum, Campingplatser, eller vad du vill gruppera.
        </p>
        <button
          className="settings-btn--connect"
          style={{ fontSize: 14, padding: "8px 20px" }}
          onClick={() => router.push("/accommodation-categories/new")}
        >
          Skapa boendetyp
        </button>
      </div>
    );
  }

  // -- Column header --
  const columnHeader = hasSelection ? (
    <div className="files-column-headers files-column-headers--selection">
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected ? "true" : someSelected ? "mixed" : "false"}
        className={`files-header-check ${someSelected ? "files-header-check--partial" : allSelected ? "files-header-check--active" : ""}`}
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name={someSelected ? "remove" : "check"} size={14} className="files-header-check__icon" />
      </button>
      <span className="files-selection__label">
        {selCount} {selCount === 1 ? "vald" : "valda"}
      </span>
      <div style={{ position: "relative" }} ref={selectDropdownRef}>
        <button className="files-selection__chevron" onClick={() => setShowSelectDropdown(!showSelectDropdown)}>
          <EditorIcon name="expand_more" size={18} />
        </button>
        {showSelectDropdown && (
          <div className="files-selection__dropdown">
            <button className="files-selection__dropdown-item" onClick={() => { selectAll(); setShowSelectDropdown(false); }}>
              Markera alla {categories.length} boendetyper
            </button>
            <button className="files-selection__dropdown-item" onClick={() => { clearAll(); setShowSelectDropdown(false); }}>
              Avmarkera alla
            </button>
          </div>
        )}
      </div>
      <button className="files-selection__delete" onClick={() => setShowDeleteConfirm(true)}>
        Ta bort {selCount === 1 ? "boendetyp" : "boendetyper"}
      </button>
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
      <span className="products-col products-col--thumb" />
      <span className="products-col products-col--name">Boendetyp</span>
      <span className="products-col products-col--detail">Status</span>
      <span className="products-col products-col--detail">Boenden</span>
      <span className="products-col products-col--detail" />
      <span className="products-col products-col--detail" />
    </div>
  );

  const FILTERS: Array<{ key: typeof statusFilter; label: string }> = [
    { key: "ALL", label: "Alla" },
    { key: "ACTIVE", label: "Aktiva" },
    { key: "INACTIVE", label: "Utkast" },
  ];

  return (
    <>
      <div className="products-filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`products-filter-btn${statusFilter === f.key ? " products-filter-btn--active" : ""}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
    <div className="products-inner">
      {columnHeader}

      {filteredCategories.map((cat) => {
        const checked = selectedIds.has(cat.id);
        const { label: sLabel, className: sClass } = statusLabel(cat.status);

        return (
          <div
            key={cat.id}
            className={`products-row${checked ? " products-row--selected" : ""}`}
            onClick={() => router.push(`/accommodation-categories/${cat.id}`)}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              className={`files-header-check${checked ? " files-header-check--active" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleSelect(cat.id); }}
            >
              <EditorIcon name="check" size={14} className="files-header-check__icon" />
            </button>
            <div className="products-col products-col--thumb">
              {cat.imageUrl ? (
                <img src={cat.imageUrl} alt="" className="products-thumb" />
              ) : (
                <div className="products-thumb products-thumb--empty">
                  <EditorIcon name="category" size={18} />
                </div>
              )}
            </div>
            <div className="products-col products-col--name">
              <span className="products-row__title">{cat.title}</span>
            </div>
            <div className="products-col products-col--detail">
              <span className={`products-status ${sClass}`}>{sLabel}</span>
            </div>
            <div className="products-col products-col--detail">
              {cat._count.items} {cat._count.items === 1 ? "boende" : "boenden"}
            </div>
            <div className="products-col products-col--detail" />
            <div className="products-col products-col--detail" />
          </div>
        );
      })}

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
              Ta bort {selCount === 1 ? "1 boendetyp" : `${selCount} boendetyper`}?
            </h3>
            <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 20 }}>
              {selCount === 1 ? "Boendetypen" : "Boendetyperna"} tas bort permanent. Boenden i kategorin paverkas inte.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowDeleteConfirm(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                disabled={isPending}
                onClick={handleDeleteSelected}
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
    </>
  );
}
