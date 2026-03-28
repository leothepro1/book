"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getCustomers, type CustomerListItem, type CustomerSortField, type CustomerSortDirection, type CustomerTab } from "./actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "");
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month}. kl. ${time}`;
}

function customerName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ") || "—";
}

const COUNTRY_NAMES: Record<string, string> = {
  SE: "Sverige", NO: "Norge", DK: "Danmark", FI: "Finland",
  DE: "Tyskland", NL: "Nederländerna", GB: "Storbritannien",
  US: "USA", FR: "Frankrike", ES: "Spanien", IT: "Italien",
  AT: "Österrike", CH: "Schweiz", PL: "Polen", BE: "Belgien",
  PT: "Portugal", IE: "Irland", IS: "Island", EE: "Estland",
  LV: "Lettland", LT: "Litauen", CZ: "Tjeckien",
};

function formatLocation(city: string | null, country: string | null): string {
  const countryName = country ? (COUNTRY_NAMES[country] ?? country) : null;
  if (city && countryName) return `${city}, ${countryName}`;
  if (countryName) return countryName;
  if (city) return city;
  return "—";
}

function marketingLabel(state: string): { label: string; bg: string; color: string } {
  switch (state) {
    case "SUBSCRIBED": return { label: "Prenumererar", bg: "#E8E8E8", color: "#616161" };
    case "UNSUBSCRIBED": return { label: "Avprenumererad", bg: "#E8E8E8", color: "#616161" };
    case "PENDING": return { label: "Väntande", bg: "#FFD6A4", color: "#5E4200" };
    default: return { label: "—", bg: "#E8E8E8", color: "#616161" };
  }
}

// ── Sort options ─────────────────────────────────────────────

const SORT_FIELDS: Array<{ key: CustomerSortField; label: string }> = [
  { key: "createdAt", label: "Datum" },
  { key: "name", label: "Namn" },
  { key: "email", label: "E-post" },
  { key: "totalOrders", label: "Ordrar" },
];

const SORT_DIRECTIONS: Array<{ key: CustomerSortDirection; label: string }> = [
  { key: "desc", label: "Nyast till äldst" },
  { key: "asc", label: "Äldst till nyast" },
];

// ── Tabs ────────────────────────────────────────────────────

const TABS: Array<{ key: CustomerTab; label: string }> = [
  { key: "all", label: "Alla" },
  { key: "subscribed", label: "Prenumeranter" },
  { key: "unsubscribed", label: "Avprenumererade" },
];

// ── Component ────────────────────────────────────────────────

export function CustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as CustomerTab) || "all";
  const urlPage = parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(urlPage);
  const [sortBy, setSortBy] = useState<CustomerSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<CustomerSortDirection>("desc");
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

  // Sync page from URL when tab changes
  useEffect(() => { setPage(urlPage); }, [urlPage]);

  useEffect(() => {
    const search = debouncedSearch || undefined;
    getCustomers({ tab: activeTab, page, limit, sortBy, sortDirection, search }).then((result) => {
      setCustomers(result.customers);
      setTotal(result.total);
      setLoaded(true);
    });
  }, [page, activeTab, sortBy, sortDirection, debouncedSearch]);

  const totalPages = Math.ceil(total / limit);

  // Close dropdowns on outside click
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
    setSelectedIds(new Set(customers.map((c) => c.id)));
  }, [customers]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;
  const allSelected = customers.length > 0 && selCount === customers.length;
  const someSelected = hasSelection && !allSelected;

  const handleHeaderCheckbox = () => {
    if (allSelected || hasSelection) clearAll(); else selectAll();
  };

  if (!loaded) return null;

  // ── Empty state ──
  if (total === 0 && activeTab === "all" && !debouncedSearch) {
    return (
      <div className="cst-empty">
        <div className="cst-empty__icon">
          <EditorIcon name="group" size={48} />
        </div>
        <h2 className="cst-empty__title">Inga kunder ännu</h2>
        <p className="cst-empty__desc">
          Kunder visas här när de genomför köp eller skapar ett konto.
        </p>
      </div>
    );
  }

  // ── Sort button + dropdown ──
  const sortButton = (
    <div className="cst-sort" ref={sortDropdownRef}>
      <button
        type="button"
        className={`cst-sort__trigger${showSortDropdown ? " cst-sort__trigger--active" : ""}`}
        onClick={() => setShowSortDropdown(!showSortDropdown)}
        aria-label="Sortera"
      >
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>swap_vert</span>
      </button>
      {showSortDropdown && (
        <div className="cst-sort__dropdown">
          <div className="cst-sort__section-label">Sortera efter</div>
          {SORT_FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`cst-sort__item${sortBy === f.key ? " cst-sort__item--active" : ""}`}
              onClick={() => { setSortBy(f.key); setPage(1); }}
            >
              {f.label}
              {sortBy === f.key && <EditorIcon name="check" size={16} className="cst-sort__item-check" />}
            </button>
          ))}
          <div className="cst-sort__divider" />
          {SORT_DIRECTIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`cst-sort__item${sortDirection === d.key ? " cst-sort__item--active" : ""}`}
              onClick={() => { setSortDirection(d.key); setPage(1); }}
            >
              {d.label}
              {sortDirection === d.key && <EditorIcon name="check" size={16} className="cst-sort__item-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Column header ──
  const columnHeader = hasSelection ? (
    <div className="cst-column-headers cst-column-headers--selection">
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected ? "true" : someSelected ? "mixed" : "false"}
        className={`cst-check ${someSelected ? "cst-check--partial" : allSelected ? "cst-check--active" : ""}`}
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name={someSelected ? "remove" : "check"} size={14} className="cst-check__icon" />
      </button>
      <span className="cst-selection__label">
        {selCount} {selCount === 1 ? "vald" : "valda"}
      </span>
      <div style={{ position: "relative" }} ref={selectDropdownRef}>
        <button className="cst-selection__chevron" onClick={() => setShowSelectDropdown(!showSelectDropdown)}>
          <EditorIcon name="expand_more" size={18} />
        </button>
        {showSelectDropdown && (
          <div className="cst-selection__dropdown">
            <button className="cst-selection__dropdown-item" onClick={() => { selectAll(); setShowSelectDropdown(false); }}>
              Markera alla {customers.length} kunder
            </button>
            <button className="cst-selection__dropdown-item" onClick={() => { clearAll(); setShowSelectDropdown(false); }}>
              Avmarkera alla
            </button>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="cst-column-headers">
      <button
        type="button"
        role="checkbox"
        aria-checked="false"
        className="cst-check"
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name="check" size={14} className="cst-check__icon" />
      </button>
      <span className="cst-col cst-col--name">Kundnamn</span>
      <span className="cst-col cst-col--marketing">E-postprenumeration</span>
      <span className="cst-col cst-col--location">Plats</span>
      <span className="cst-col cst-col--orders">Ordrar</span>
      <span className="cst-col cst-col--spent">Belopp spenderat</span>
    </div>
  );

  return (
    <>
      <div className="cst-filter-bar">
        <div className="cst-search">
          <span className="material-symbols-rounded cst-search__icon">search</span>
          <input
            type="text"
            className="cst-search__input"
            placeholder="Sök kunder"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        {sortButton}
      </div>
      <div>
        {columnHeader}

        {customers.length === 0 ? (
          <div className="cst-empty-filtered">Inga kunder matchar filtret</div>
        ) : (
          customers.map((customer) => {
            const checked = selectedIds.has(customer.id);
            const marketing = marketingLabel(customer.emailMarketingState);

            return (
              <div
                key={customer.id}
                className={`cst-row${checked ? " cst-row--selected" : ""}`}
                onClick={() => router.push(`/customers/${customer.id}`)}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  className={`cst-check${checked ? " cst-check--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(customer.id); }}
                >
                  <EditorIcon name="check" size={14} className="cst-check__icon" />
                </button>
                <div className="cst-col cst-col--name">
                  <span className="cst-row__name">{customerName(customer.firstName, customer.lastName)}</span>
                </div>
                <div className="cst-col cst-col--marketing">
                  <span style={{ display: "inline-block", background: marketing.bg, color: marketing.color, borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>{marketing.label}</span>
                </div>
                <div className="cst-col cst-col--location">
                  <span className="cst-row__location">{formatLocation(customer.city, customer.country)}</span>
                </div>
                <div className="cst-col cst-col--orders">
                  <span className="cst-row__orders">{customer.totalOrders === 0 ? "—" : `${customer.totalOrders} ${customer.totalOrders === 1 ? "order" : "ordrar"}`}</span>
                </div>
                <div className="cst-col cst-col--spent">
                  <span className="cst-row__spent">{customer.totalSpent > 0 ? `${formatPriceDisplay(customer.totalSpent, customer.currency)} kr` : "—"}</span>
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
