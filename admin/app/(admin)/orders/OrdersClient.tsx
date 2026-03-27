"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getOrders, type OrderListItem, type OrderSortField, type OrderSortDirection } from "./actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import type { OrderStatus } from "@prisma/client";

// ── Helpers ──────────────────────────────────────────────────

function paymentStatusLabel(status: OrderStatus): { label: string; className: string } {
  switch (status) {
    case "PENDING": return { label: "Väntande", className: "ord-badge--pending" };
    case "PAID": return { label: "Betald", className: "ord-badge--paid" };
    case "FULFILLED": return { label: "Betald", className: "ord-badge--paid" };
    case "CANCELLED": return { label: "Avbokad", className: "ord-badge--cancelled" };
    case "REFUNDED": return { label: "Återbetald", className: "ord-badge--refunded" };
    default: return { label: status, className: "" };
  }
}

function fulfillmentStatusLabel(status: OrderStatus): { label: string; className: string } {
  switch (status) {
    case "PENDING": return { label: "Ej levererad", className: "ord-badge--unfulfilled" };
    case "PAID": return { label: "Ej levererad", className: "ord-badge--unfulfilled" };
    case "FULFILLED": return { label: "Levererad", className: "ord-badge--fulfilled" };
    case "CANCELLED": return { label: "Avbokad", className: "ord-badge--cancelled" };
    case "REFUNDED": return { label: "Återbetald", className: "ord-badge--refunded" };
    default: return { label: status, className: "" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  booking_com: { label: "Booking.com", color: "#003580" },
  expedia: { label: "Expedia", color: "#00355F" },
};

function channelDisplay(sourceChannel: string | null): { label: string; color: string } | null {
  if (!sourceChannel || sourceChannel === "direct") return null;
  return CHANNEL_LABELS[sourceChannel] ?? { label: sourceChannel, color: "var(--admin-text-secondary)" };
}

function formatArticles(titles: string[], count: number): string {
  if (count === 0) return "—";
  const shown = titles.slice(0, 2).join(", ");
  if (count > 2) return `${shown} +${count - 2}`;
  return shown;
}

// ── Sort options ─────────────────────────────────────────────

const SORT_FIELDS: Array<{ key: OrderSortField; label: string }> = [
  { key: "orderNumber", label: "Ordernummer" },
  { key: "createdAt", label: "Datum" },
  { key: "guestName", label: "Kund" },
  { key: "totalAmount", label: "Artiklar" },
  { key: "status", label: "Betalningsstatus" },
];

const SORT_DIRECTIONS: Array<{ key: OrderSortDirection; label: string }> = [
  { key: "desc", label: "Nyast till äldst" },
  { key: "asc", label: "Äldst till nyast" },
];

// ── Status filters ───────────────────────────────────────────

const FILTERS: Array<{ key: OrderStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "Alla" },
  { key: "PENDING", label: "Väntande" },
  { key: "PAID", label: "Betalda" },
  { key: "FULFILLED", label: "Levererade" },
  { key: "CANCELLED", label: "Avbokade" },
  { key: "REFUNDED", label: "Återbetalda" },
];

// ── Component ────────────────────────────────────────────────

export function OrdersClient() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<OrderSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<OrderSortDirection>("desc");
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

  useEffect(() => {
    const filter = statusFilter === "ALL" ? undefined : statusFilter;
    const search = debouncedSearch || undefined;
    getOrders({ status: filter, page, limit, sortBy, sortDirection, search }).then((result) => {
      setOrders(result.orders);
      setTotal(result.total);
      setLoaded(true);
    });
  }, [page, statusFilter, sortBy, sortDirection, debouncedSearch]);

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
    setSelectedIds(new Set(orders.map((o) => o.id)));
  }, [orders]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;
  const allSelected = orders.length > 0 && selCount === orders.length;
  const someSelected = hasSelection && !allSelected;

  const handleHeaderCheckbox = () => {
    if (allSelected || hasSelection) clearAll(); else selectAll();
  };

  if (!loaded) return null;

  // ── Empty state ──
  if (total === 0 && statusFilter === "ALL") {
    return (
      <div className="ord-empty">
        <div className="ord-empty__icon">
          <EditorIcon name="shopping_bag" size={48} />
        </div>
        <h2 className="ord-empty__title">Inga beställningar ännu</h2>
        <p className="ord-empty__desc">
          Beställningar visas här när dina kunder genomför köp i din butik.
        </p>
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
              Markera alla {orders.length} beställningar
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
      <span className="ord-col ord-col--order">Beställning</span>
      <span className="ord-col ord-col--date">Datum</span>
      <span className="ord-col ord-col--customer">Kund</span>
      <span className="ord-col ord-col--total">Totalt</span>
      <span className="ord-col ord-col--payment">Betalningsstatus</span>
      <span className="ord-col ord-col--fulfillment">Distributionsstatus</span>
      <span className="ord-col ord-col--items">Artiklar</span>
      <span className="ord-col ord-col--tags">Taggar</span>
      <span className="ord-col ord-col--channel">Kanal</span>
    </div>
  );

  return (
    <>
      <div className="ord-filter-bar">
        {searchMode ? (
          <>
            <div className="ord-search">
              <span className="material-symbols-rounded ord-search__icon">search</span>
              <input
                ref={searchInputRef}
                type="text"
                className="ord-search__input"
                placeholder="Sök bland alla ordrar"
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
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`ord-filter-btn${statusFilter === f.key ? " ord-filter-btn--active" : ""}`}
                onClick={() => { setStatusFilter(f.key); setPage(1); }}
              >
                {f.label}
              </button>
            ))}
            <div className="ord-filter-bar__actions">
              <button
                type="button"
                className="ord-search-trigger"
                onClick={() => setSearchMode(true)}
                aria-label="Sök"
              >
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>search</span>
              </button>
              {sortButton}
            </div>
          </>
        )}
      </div>
      <div>
        {columnHeader}

        {orders.length === 0 ? (
          <div className="ord-empty-filtered">Inga beställningar matchar filtret</div>
        ) : (
          orders.map((order) => {
            const checked = selectedIds.has(order.id);
            const payment = paymentStatusLabel(order.status);
            const fulfillment = fulfillmentStatusLabel(order.status);

            return (
              <div
                key={order.id}
                className={`ord-row${checked ? " ord-row--selected" : ""}`}
                onClick={() => router.push(`/orders/${order.id}`)}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  className={`ord-check${checked ? " ord-check--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(order.id); }}
                >
                  <EditorIcon name="check" size={14} className="ord-check__icon" />
                </button>
                <div className="ord-col ord-col--order">
                  <span className="ord-row__order-number">#{order.orderNumber}</span>
                </div>
                <div className="ord-col ord-col--date">
                  <span className="ord-row__date">{formatDate(order.createdAt)}</span>
                </div>
                <div className="ord-col ord-col--customer">
                  <span className="ord-row__customer-name">{order.guestName || "—"}</span>
                </div>
                <div className="ord-col ord-col--total">
                  <span className="ord-row__total">{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
                </div>
                <div className="ord-col ord-col--payment">
                  <span className={`ord-badge ${payment.className}`}>{payment.label}</span>
                </div>
                <div className="ord-col ord-col--fulfillment">
                  <span className={`ord-badge ${fulfillment.className}`}>{fulfillment.label}</span>
                </div>
                <div className="ord-col ord-col--items">
                  <span className="ord-row__items">{formatArticles(order.productTitles, order.lineItemCount)}</span>
                </div>
                <div className="ord-col ord-col--tags">
                  <span className="ord-row__tags">—</span>
                </div>
                <div className="ord-col ord-col--channel">
                  {(() => {
                    const ch = channelDisplay(order.sourceChannel);
                    if (!ch) return null;
                    return (
                      <span className="ord-channel-badge" style={{ color: ch.color }}>
                        {ch.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination footer */}
      {total > 0 && (
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
