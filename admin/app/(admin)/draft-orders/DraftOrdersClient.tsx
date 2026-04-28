"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { SearchIcon } from "@/app/_components/SearchIcon";
import { formatSek } from "@/app/_lib/money/format";
import { DraftBadge } from "@/app/(admin)/_components/draft-orders/DraftBadge";
import { getDrafts, type DraftTab } from "./actions";
import type { DraftListItem, DraftListSortField, DraftListSortDirection } from "@/app/_lib/draft-orders";

// ── Helpers ──────────────────────────────────────────────────

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = d.getDate();
  const month = d.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "");
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month}. kl. ${time}`;
}

function customerDisplay(customer: DraftListItem["customer"]): string {
  if (!customer) return "—";
  return customer.name ?? customer.email ?? "—";
}

// ── Sort options ─────────────────────────────────────────────

const SORT_FIELDS: Array<{ key: DraftListSortField; label: string }> = [
  { key: "expiresAt", label: "Utgår" },
  { key: "createdAt", label: "Skapad" },
  { key: "updatedAt", label: "Uppdaterad" },
  { key: "totalAmount", label: "Totalt" },
];

const SORT_DIRECTIONS: Array<{ key: DraftListSortDirection; label: string }> = [
  { key: "asc", label: "Stigande" },
  { key: "desc", label: "Fallande" },
];

// ── Tabs ─────────────────────────────────────────────────────

const TABS: Array<{ key: DraftTab; label: string }> = [
  { key: "alla", label: "Alla" },
  { key: "öppna", label: "Öppna" },
  { key: "fakturerade", label: "Fakturerade" },
  { key: "betalda", label: "Betalda" },
  { key: "stängda", label: "Stängda" },
];

// ── Component ────────────────────────────────────────────────

export function DraftOrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as DraftTab) || "alla";

  const [items, setItems] = useState<DraftListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<DraftListSortField>("expiresAt");
  const [sortDirection, setSortDirection] = useState<DraftListSortDirection>("asc");
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const selectDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const limit = 25;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus search input when entering search mode
  useEffect(() => {
    if (searchMode && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchMode]);

  // Reset to page 1 when tab changes
  useEffect(() => { setPage(1); }, [activeTab]);

  // Data fetch
  useEffect(() => {
    const search = debouncedSearch || undefined;
    getDrafts({ tab: activeTab, page, limit, sortBy, sortDirection, search }).then((result) => {
      setItems(result.items);
      setTotal(result.total);
      setLoaded(true);
    });
  }, [page, activeTab, sortBy, sortDirection, debouncedSearch]);

  const totalPages = Math.ceil(total / limit);

  // Close popups on outside click
  useEffect(() => {
    if (!showSelectDropdown && !showSortDropdown) return;
    const handle = (e: MouseEvent) => {
      if (showSelectDropdown && selectDropdownRef.current && !selectDropdownRef.current.contains(e.target as Node)) {
        setShowSelectDropdown(false);
      }
      if (showSortDropdown && sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSelectDropdown, showSortDropdown]);

  // Selection logic
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((d) => d.id)));
  }, [items]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;
  const allSelected = items.length > 0 && selCount === items.length;
  const someSelected = hasSelection && !allSelected;

  const handleHeaderCheckbox = () => {
    if (allSelected || hasSelection) clearAll(); else selectAll();
  };

  if (!loaded) return null;

  // ── Empty state ──
  if (total === 0 && activeTab === "alla" && !debouncedSearch) {
    return (
      <div className="ord-empty">
        <div className="ord-empty__icon">
          <EditorIcon name="draft" size={48} />
        </div>
        <h2 className="ord-empty__title">Inga utkastordrar ännu</h2>
        <p className="ord-empty__desc">
          Skapa en ny utkastorder för att börja.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link href="/draft-orders/new" className="admin-btn admin-btn--accent">
            Skapa order
          </Link>
        </div>
      </div>
    );
  }

  // ── Sort button + dropdown ──
  const sortButton = (
    <div className="ord-sort" ref={sortDropdownRef}>
      <button
        type="button"
        className={`ord-sort__trigger${showSortDropdown ? " ord-sort__trigger--active" : ""}`}
        onClick={() => setShowSortDropdown(!showSortDropdown)}
        aria-label="Sortera"
      >
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>swap_vert</span>
      </button>
      {showSortDropdown && (
        <div className="ord-sort__dropdown">
          <div className="ord-sort__section-label">Sortera efter</div>
          {SORT_FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ord-sort__item${sortBy === f.key ? " ord-sort__item--active" : ""}`}
              onClick={() => { setSortBy(f.key); setPage(1); }}
            >
              {f.label}
              {sortBy === f.key && <EditorIcon name="check" size={16} className="ord-sort__item-check" />}
            </button>
          ))}
          <div className="ord-sort__divider" />
          {SORT_DIRECTIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`ord-sort__item${sortDirection === d.key ? " ord-sort__item--active" : ""}`}
              onClick={() => { setSortDirection(d.key); setPage(1); }}
            >
              {d.label}
              {sortDirection === d.key && <EditorIcon name="check" size={16} className="ord-sort__item-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Column header ──
  const columnHeader = hasSelection ? (
    <div className="ord-column-headers ord-column-headers--selection">
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected ? "true" : someSelected ? "mixed" : "false"}
        className={`ord-check ${someSelected ? "ord-check--partial" : allSelected ? "ord-check--active" : ""}`}
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name={someSelected ? "remove" : "check"} size={14} className="ord-check__icon" />
      </button>
      <span className="ord-selection__label">
        {selCount} {selCount === 1 ? "vald" : "valda"}
      </span>
      <div style={{ position: "relative" }} ref={selectDropdownRef}>
        <button className="ord-selection__chevron" onClick={() => setShowSelectDropdown(!showSelectDropdown)}>
          <EditorIcon name="expand_more" size={18} />
        </button>
        {showSelectDropdown && (
          <div className="ord-selection__dropdown">
            <button className="ord-selection__dropdown-item" onClick={() => { selectAll(); setShowSelectDropdown(false); }}>
              Markera alla {items.length} utkast
            </button>
            <button className="ord-selection__dropdown-item" onClick={() => { clearAll(); setShowSelectDropdown(false); }}>
              Avmarkera alla
            </button>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="ord-column-headers">
      <button
        type="button"
        role="checkbox"
        aria-checked="false"
        className="ord-check"
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name="check" size={14} className="ord-check__icon" />
      </button>
      <span className="ord-col ord-col--order">Utkast</span>
      <span className="ord-col ord-col--customer">Kund</span>
      <span className="ord-col ord-col--items">Boende</span>
      <span className="ord-col ord-col--payment">Status</span>
      <span className="ord-col ord-col--total">Totalt</span>
      <span className="ord-col ord-col--date">Utgår</span>
      <span className="ord-col ord-col--date">Skapad</span>
    </div>
  );

  return (
    <>
      <div className="ord-filter-bar">
        {searchMode ? (
          <>
            <div className="ord-search">
              <SearchIcon size={20} className="ord-search__icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="ord-search__input"
                placeholder="Sök bland alla utkast"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>
            <button
              type="button"
              className="ord-search__cancel"
              onClick={() => { setSearchMode(false); setSearchQuery(""); setDebouncedSearch(""); setPage(1); }}
            >
              Avbryt
            </button>
          </>
        ) : (
          <>
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "alla" ? "/draft-orders" : `/draft-orders?tab=${encodeURIComponent(t.key)}`}
                className={`ord-filter-btn${activeTab === t.key ? " ord-filter-btn--active" : ""}`}
              >
                {t.label}
              </Link>
            ))}
            <div className="ord-filter-bar__actions">
              <button
                type="button"
                className="ord-search-trigger"
                onClick={() => setSearchMode(true)}
                aria-label="Sök"
              >
                <SearchIcon size={20} />
              </button>
              {sortButton}
            </div>
          </>
        )}
      </div>
      <div>
        {columnHeader}

        {items.length === 0 ? (
          <div className="ord-empty-filtered">Inga utkast matchar filtret</div>
        ) : (
          items.map((draft) => {
            const checked = selectedIds.has(draft.id);

            return (
              <div
                key={draft.id}
                className={`ord-row${checked ? " ord-row--selected" : ""}`}
                onClick={() => router.push(`/draft-orders/${draft.id}/konfigurera`)}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  className={`ord-check${checked ? " ord-check--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(draft.id); }}
                >
                  <EditorIcon name="check" size={14} className="ord-check__icon" />
                </button>
                <div className="ord-col ord-col--order">
                  <span className="ord-row__order-number">{draft.displayNumber}</span>
                </div>
                <div className="ord-col ord-col--customer">
                  <span className="ord-row__customer-name">{customerDisplay(draft.customer)}</span>
                </div>
                <div className="ord-col ord-col--items">
                  <span className="ord-row__items">{draft.accommodationSummary}</span>
                </div>
                <div className="ord-col ord-col--payment">
                  <DraftBadge status={draft.status} />
                </div>
                <div className="ord-col ord-col--total">
                  <span className="ord-row__total">{formatSek(draft.totalAmount, { currency: draft.currency })}</span>
                </div>
                <div className="ord-col ord-col--date">
                  <span className="ord-row__date">{formatDate(draft.expiresAt)}</span>
                </div>
                <div className="ord-col ord-col--date">
                  <span className="ord-row__date">{formatDate(draft.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="files-pagination">
          <div className="files-pagination__nav">
            <button
              className="files-pagination__btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Föregående sida"
            >
              <EditorIcon name="chevron_left" size={20} />
            </button>
            <button
              className="files-pagination__btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Nästa sida"
            >
              <EditorIcon name="chevron_right" size={20} />
            </button>
          </div>
          <span className="files-pagination__label">
            {Math.min((page - 1) * limit + 1, total)} – {Math.min(page * limit, total)}
          </span>
        </div>
      )}
    </>
  );
}
