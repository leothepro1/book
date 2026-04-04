"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useOrderFormat } from "@/app/(admin)/_hooks/useOrderFormat";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getOrders, type OrderListItem, type OrderSortField, type OrderSortDirection, type OrderTab } from "./actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { OrderBadge } from "@/app/(admin)/_components/orders/OrderBadge";
import type { OrderFinancialStatus, OrderFulfillmentStatus } from "@prisma/client";

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "");
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month}. kl. ${time}`;
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

// ── Tabs (Shopify-style saved views) ────────────────────────

const TABS: Array<{ key: OrderTab; label: string }> = [
  { key: "all", label: "Alla" },
  { key: "unfulfilled", label: "Kommande" },
  { key: "unpaid", label: "Obetalda" },
  { key: "open", label: "Öppna" },
  { key: "closed", label: "Stängda" },
];

// ── Component ────────────────────────────────────────────────

export function OrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as OrderTab) || "all";
  const activeChannel = searchParams.get("channel") || "";
  const fmtOrder = useOrderFormat();
  const urlPage = parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(urlPage);
  const [sortBy, setSortBy] = useState<OrderSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<OrderSortDirection>("desc");
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPopup, setItemsPopup] = useState<string | null>(null);
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const selectDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
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
    const channel = activeChannel || undefined;
    getOrders({ tab: activeTab, page, limit, sortBy, sortDirection, search, channel }).then((result) => {
      setOrders(result.orders);
      setTotal(result.total);
      setLoaded(true);
    });
  }, [page, activeTab, activeChannel, sortBy, sortDirection, debouncedSearch]);

  const totalPages = Math.ceil(total / limit);

  // Close popups on outside click
  useEffect(() => {
    if (!showSelectDropdown && !showSortDropdown && !itemsPopup) return;
    const handle = (e: MouseEvent) => {
      if (showSelectDropdown && selectDropdownRef.current && !selectDropdownRef.current.contains(e.target as Node)) {
        setShowSelectDropdown(false);
      }
      if (showSortDropdown && sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
      if (showChannelDropdown && channelDropdownRef.current && !channelDropdownRef.current.contains(e.target as Node)) {
        setShowChannelDropdown(false);
      }
      if (itemsPopup) {
        const popup = document.querySelector(".ord-items-popup");
        const trigger = (e.target as HTMLElement).closest(".ord-row__hoverable");
        if (popup && !popup.contains(e.target as Node) && !trigger) {
          setItemsPopup(null);
        }
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSelectDropdown, showSortDropdown, itemsPopup]);

  // Close items popup on scroll
  useEffect(() => {
    if (!itemsPopup) return;
    const close = () => setItemsPopup(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [itemsPopup]);

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
  if (total === 0 && activeTab === "all" && !debouncedSearch) {
    return (
      <div className="ord-empty">
        <div className="ord-empty__icon">
          <EditorIcon name="inbox" size={48} />
        </div>
        <h2 className="ord-empty__title">Inga ordrar ännu</h2>
        <p className="ord-empty__desc">
          Ordrar visas här när dina kunder genomför köp i din butik.
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
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "all" ? "/orders" : `/orders?tab=${t.key}`}
                className={`ord-filter-btn${activeTab === t.key ? " ord-filter-btn--active" : ""}`}
              >
                {t.label}
              </Link>
            ))}
            <div className="ord-filter-bar__actions">
              {/* Channel filter */}
              <div className="cst-sort" ref={channelDropdownRef}>
                <button
                  type="button"
                  className={`cst-sort__trigger${showChannelDropdown || activeChannel ? " cst-sort__trigger--active" : ""}`}
                  onClick={() => setShowChannelDropdown(!showChannelDropdown)}
                  aria-label="Filtrera kanal"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>conversion_path</span>
                </button>
                {showChannelDropdown && (
                  <div className="cst-sort__dropdown">
                    <div className="cst-sort__section-label">Försäljningskanal</div>
                    {[
                      { key: "", label: "Alla kanaler" },
                      { key: "direct", label: "Direktbokning" },
                      ...Object.entries(CHANNEL_LABELS).map(([key, { label }]) => ({ key, label })),
                    ].map((ch) => (
                      <button
                        key={ch.key}
                        type="button"
                        className={`cst-sort__item${activeChannel === ch.key ? " cst-sort__item--active" : ""}`}
                        onClick={() => {
                          const params = new URLSearchParams(searchParams.toString());
                          if (ch.key) params.set("channel", ch.key); else params.delete("channel");
                          params.delete("page");
                          router.push(`/orders${params.toString() ? `?${params}` : ""}`);
                          setShowChannelDropdown(false);
                        }}
                      >
                        {ch.label}
                        {activeChannel === ch.key && <EditorIcon name="check" size={16} className="cst-sort__item-check" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
          <div className="ord-empty-filtered">Inga ordrar matchar filtret</div>
        ) : (
          orders.map((order) => {
            const checked = selectedIds.has(order.id);

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
                  <span className="ord-row__order-number">{fmtOrder(order.orderNumber)}</span>
                </div>
                <div className="ord-col ord-col--date">
                  <span className="ord-row__date">{formatDate(order.createdAt)}</span>
                </div>
                <div className="ord-col ord-col--customer">
                  <span className="ord-row__customer-name ord-row__hoverable">{order.guestName || "—"}<EditorIcon name="expand_more" size={16} className="ord-row__hover-chevron" /></span>
                </div>
                <div className="ord-col ord-col--total">
                  <span className="ord-row__total">{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
                </div>
                <div className="ord-col ord-col--payment">
                  <OrderBadge type="financial" financial={order.financialStatus as OrderFinancialStatus} fulfillment={order.fulfillmentStatus as OrderFulfillmentStatus} />
                </div>
                <div className="ord-col ord-col--fulfillment">
                  <OrderBadge type="fulfillment" fulfillment={order.fulfillmentStatus as OrderFulfillmentStatus} />
                </div>
                <div
                  className="ord-col ord-col--items"
                  style={{ position: "relative", zIndex: itemsPopup === order.id ? 999 : undefined }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemsPopup(itemsPopup === order.id ? null : order.id);
                  }}
                >
                  <span className="ord-row__items ord-row__hoverable">
                    {order.lineItemCount === 0 ? "—" : `${order.lineItemCount} ${order.lineItemCount === 1 ? "artikel" : "artiklar"}`}
                    <EditorIcon name="expand_more" size={16} className="ord-row__hover-chevron" />
                  </span>
                  {itemsPopup === order.id && order.lineItems.length > 0 && (
                    <div
                      className="ord-items-popup"
                      ref={(el) => {
                        if (!el) return;
                        const trigger = el.parentElement?.querySelector(".ord-row__hoverable");
                        if (!trigger) return;
                        const rect = trigger.getBoundingClientRect();
                        el.style.position = "fixed";
                        el.style.top = `${rect.bottom + 4}px`;
                        el.style.left = `${rect.left}px`;
                      }}
                    >
                      {order.lineItems.map((li, i) => (
                        <div key={i} className="ord-items-popup__item">
                          {li.imageUrl ? (
                            <img src={li.imageUrl} alt={li.title} className="ord-items-popup__img" />
                          ) : (
                            <div className="ord-items-popup__img ord-items-popup__img--empty">
                              <EditorIcon name="image" size={16} />
                            </div>
                          )}
                          <span className="ord-items-popup__title">{li.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ord-col ord-col--tags">
                  {order.tags.length > 0 ? (
                    <span className="ord-row__tags">
                      {order.tags.map((tag) => (
                        <span key={tag} style={{ display: "inline-block", background: "#E8E8E8", color: "#616161", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", marginRight: 4 }}>{tag}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="ord-row__tags">—</span>
                  )}
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
